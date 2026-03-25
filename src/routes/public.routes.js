// ============================================
// ملف: src/routes/public.routes.js
// الوصف: جميع المسارات العامة (لا تحتاج توثيق)
// الإصدار: 3.0
// ============================================

const express = require('express');
const router = express.Router();

const { 
  healthController,
  assetsController,
  storeController,
  aggregateController,
  securityController
} = require('../controllers');

const rateLimiter = require('../middlewares/rateLimit.middleware');
const validate = require('../middlewares/validate.middleware');
const PaginationUtils = require('../utils/pagination.util');

// ========== 1. مسارات الصحة ==========
/**
 * @swagger
 * tags:
 *   name: 🏥 Health
 *   description: التحقق من صحة النظام
 */

/**
 * @swagger
 * /public/health:
 *   get:
 *     summary: فحص صحة النظام (سريع)
 *     tags: [🏥 Health]
 *     responses:
 *       200:
 *         description: النظام يعمل بشكل طبيعي
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 uptime:
 *                   type: number
 *                 version:
 *                   type: string
 */
router.get('/health', healthController.quickHealthCheck);

/**
 * @swagger
 * /public/health/detailed:
 *   get:
 *     summary: فحص صحة النظام (تفصيلي)
 *     tags: [🏥 Health]
 *     responses:
 *       200:
 *         description: تفاصيل حالة النظام
 */
router.get('/health/detailed', healthController.fullHealthCheck);
router.get('/health/ready', healthController.readinessProbe);
router.get('/health/live', healthController.livenessProbe);

// ========== 2. الملفات الثابتة ==========
/**
 * @swagger
 * tags:
 *   name: 📁 Assets
 *   description: الملفات الثابتة والصور
 */

/**
 * @swagger
 * /public/assets/images:
 *   get:
 *     summary: الحصول على قائمة الصور المتاحة
 *     tags: [📁 Assets]
 *     responses:
 *       200:
 *         description: قائمة الصور
 */
router.get('/assets/images', assetsController.getImages);
router.get('/assets/icons', assetsController.getIcons);
router.get('/assets/defaults', assetsController.getDefaultImages);

// ========== 3. المتاجر (عام) ==========
/**
 * @swagger
 * tags:
 *   name: 🏪 Stores
 *   description: مسارات المتاجر العامة
 */

/**
 * @swagger
 * /public/stores:
 *   get:
 *     summary: الحصول على قائمة المتاجر
 *     tags: [🏪 Stores]
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
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *       - in: query
 *         name: radius
 *         schema:
 *           type: integer
 *           default: 5000
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 5
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: وسوم مفصولة بفواصل
 *     responses:
 *       200:
 *         description: قائمة المتاجر
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
 *                     stores:
 *                       type: array
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                     stats:
 *                       type: object
 */
router.get('/stores', PaginationUtils.validatePaginationParams, storeController.getStoresPaginated);

/**
 * @swagger
 * /public/stores/smart:
 *   get:
 *     summary: الحصول على المتاجر بتصنيف ذكي
 *     tags: [🏪 Stores]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *       - in: query
 *         name: minFee
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxFee
 *         schema:
 *           type: number
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: قائمة المتاجر المصفاة
 */
router.get('/stores/smart', storeController.getStoresSmart);

/**
 * @swagger
 * /public/stores/search:
 *   get:
 *     summary: البحث في المتاجر
 *     tags: [🏪 Stores]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: كلمة البحث
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: نتائج البحث
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Store'
 */
router.get('/stores/search', storeController.searchStores);

/**
 * @swagger
 * /public/stores/search/advanced:
 *   get:
 *     summary: بحث متقدم في المتاجر
 *     tags: [🏪 Stores]
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
 *         name: name
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *       - in: query
 *         name: hasDelivery
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: minFee
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxFee
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: نتائج البحث المتقدم
 */
router.get('/stores/search/advanced', PaginationUtils.validatePaginationParams, storeController.advancedSearch);

/**
 * @swagger
 * /public/stores/{id}:
 *   get:
 *     summary: تفاصيل متجر محدد
 *     tags: [🏪 Stores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تفاصيل المتجر
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
router.get('/stores/:id', storeController.getStoreDetails);

/**
 * @swagger
 * /public/stores/{id}/products:
 *   get:
 *     summary: منتجات متجر محدد
 *     tags: [🏪 Stores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: inStock
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: قائمة المنتجات
 */
router.get('/stores/:id/products', storeController.getStoreProducts);

/**
 * @swagger
 * /public/stores/{storeId}/reviews:
 *   get:
 *     summary: تقييمات متجر محدد
 *     tags: [🏪 Stores]
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest, highest, lowest]
 *           default: newest
 *     responses:
 *       200:
 *         description: قائمة التقييمات
 */
router.get('/stores/:storeId/reviews', storeController.getStoreReviews);

// ========== 4. البيانات العامة ==========
/**
 * @swagger
 * tags:
 *   name: 📊 Public Data
 *   description: البيانات العامة للتطبيق
 */

/**
 * @swagger
 * /public/home:
 *   get:
 *     summary: بيانات الصفحة الرئيسية
 *     tags: [📊 Public Data]
 *     responses:
 *       200:
 *         description: بيانات الصفحة الرئيسية (متاجر مميزة، تصنيفات، عروض)
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
 *                     topStores:
 *                       type: array
 *                     featuredItems:
 *                       type: array
 *                     recentReviews:
 *                       type: array
 *                     categories:
 *                       type: array
 *                     stats:
 *                       type: object
 *                     promotions:
 *                       type: array
 */
router.get('/home', aggregateController.getHomeData);

/**
 * @swagger
 * /public/search:
 *   get:
 *     summary: بحث موحد في جميع المحتويات
 *     tags: [📊 Public Data]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [all, stores, items, users]
 *           default: all
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: نتائج البحث
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
 *                     stores:
 *                       type: array
 *                     items:
 *                       type: array
 *                     users:
 *                       type: array
 *                     orders:
 *                       type: array
 */
router.get('/search', aggregateController.unifiedSearch);

/**
 * @swagger
 * /public/stats:
 *   get:
 *     summary: إحصائيات عامة للتطبيق
 *     tags: [📊 Public Data]
 *     responses:
 *       200:
 *         description: إحصائيات (عدد المستخدمين، المتاجر، الطلبات)
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
 *                     stores:
 *                       type: integer
 *                     items:
 *                       type: integer
 *                     orders:
 *                       type: integer
 *                     reviews:
 *                       type: integer
 *                     averageRating:
 *                       type: number
 *                     topCategories:
 *                       type: array
 *                     topCities:
 *                       type: array
 */
router.get('/stats', aggregateController.getPublicStats);

// ========== 5. فحص الأمان (عام) ==========
/**
 * @swagger
 * tags:
 *   name: 🛡️ Security
 *   description: فحوصات الأمان العامة
 */

/**
 * @swagger
 * /public/security/check-password:
 *   post:
 *     summary: فحص قوة كلمة المرور
 *     tags: [🛡️ Security]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 example: MyStr0ngP@ssw0rd
 *     responses:
 *       200:
 *         description: نتيجة فحص كلمة المرور
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
 *                     strength:
 *                       type: string
 *                     score:
 *                       type: integer
 *                     feedback:
 *                       type: object
 */
router.post('/security/check-password', 
  rateLimiter.apiLimiter, 
  securityController.checkPassword
);

/**
 * @swagger
 * /public/security/check-email:
 *   post:
 *     summary: فحص صحة البريد الإلكتروني
 *     tags: [🛡️ Security]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: نتيجة فحص البريد الإلكتروني
 */
router.post('/security/check-email', 
  rateLimiter.apiLimiter, 
  securityController.checkEmail
);

// ========== 6. معلومات النظام ==========
/**
 * @swagger
 * /public/info:
 *   get:
 *     summary: معلومات النظام والإصدارات
 *     tags: [📊 Public Data]
 *     responses:
 *       200:
 *         description: معلومات النظام
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
 *                     name:
 *                       type: string
 *                     version:
 *                       type: string
 *                     description:
 *                       type: string
 *                     baseUrl:
 *                       type: string
 *                     documentation:
 *                       type: string
 *                     endpoints:
 *                       type: object
 */
router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Food Delivery Platform',
      version: '3.0.0',
      description: 'منصة توصيل طعام متكاملة',
      baseUrl: 'http://localhost:3000/api/v1',
      documentation: '/api-docs',
      endpoints: {
        auth: '/api/v1/auth',
        public: '/api/v1/public',
        client: '/api/v1/client',
        vendor: '/api/v1/vendor',
        driver: '/api/v1/driver',
        admin: '/api/v1/admin',
        map: '/api/v1/map',
        chat: '/api/v1/chat',
        orders: '/api/v1/orders'
      }
    }
  });
});

module.exports = router;