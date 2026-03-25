// ============================================
// ملف: src/routes/aggregate.routes.js
// الوصف: مسارات التجميع والبيانات المركبة (تتطلب توثيق)
// الإصدار: 2.0
// ============================================

const express = require('express');
const router = express.Router();

const { aggregateController } = require('../controllers');
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const PaginationUtils = require('../utils/pagination.util');

/**
 * @swagger
 * tags:
 *   name: 📈 Aggregates
 *   description: البيانات المجمعة والتقارير
 */

// ========== 1. مسارات المستخدم المسجل ==========

/**
 * @swagger
 * /aggregate/dashboard:
 *   get:
 *     summary: لوحة تحكم المستخدم (بيانات مخصصة حسب الدور)
 *     tags: [📈 Aggregates]
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
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     addresses:
 *                       type: array
 *                     recentOrders:
 *                       type: array
 *                     topStores:
 *                       type: array
 *                     recentReviews:
 *                       type: array
 *                     stats:
 *                       type: object
 */
router.get('/dashboard', auth, aggregateController.getDashboardData);

/**
 * @swagger
 * /aggregate/stores/{id}/full:
 *   get:
 *     summary: تفاصيل كاملة للمتجر مع بيانات إضافية
 *     tags: [📈 Aggregates]
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
 *         description: تفاصيل المتجر الكاملة
 */
router.get('/stores/:id/full', auth, aggregateController.getStoreDetails);

/**
 * @swagger
 * /aggregate/orders/{id}/full:
 *   get:
 *     summary: تفاصيل كاملة للطلب مع التتبع
 *     tags: [📈 Aggregates]
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
 *         description: تفاصيل الطلب مع التتبع
 */
router.get('/orders/:id/full', auth, aggregateController.getOrderWithTracking);

/**
 * @swagger
 * /aggregate/stores:
 *   get:
 *     summary: المتاجر مع pagination (بيانات محسنة)
 *     tags: [📈 Aggregates]
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
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: قائمة المتاجر
 */
router.get('/stores', auth, PaginationUtils.validatePaginationParams, aggregateController.getStoresPaginated);

/**
 * @swagger
 * /aggregate/items:
 *   get:
 *     summary: العناصر مع pagination
 *     tags: [📈 Aggregates]
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
 *         name: store
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
 *     responses:
 *       200:
 *         description: قائمة العناصر
 */
router.get('/items', auth, PaginationUtils.validatePaginationParams, aggregateController.getItemsPaginated);

/**
 * @swagger
 * /aggregate/orders/me:
 *   get:
 *     summary: طلبات المستخدم الحالي مع pagination
 *     tags: [📈 Aggregates]
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
router.get('/orders/me', auth, PaginationUtils.validatePaginationParams, aggregateController.getMyOrdersPaginated);

// ========== 2. مسارات الأدمن فقط ==========

/**
 * @swagger
 * /aggregate/admin/dashboard:
 *   get:
 *     summary: لوحة تحكم المشرف
 *     tags: [📈 Aggregates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: بيانات لوحة تحكم المشرف
 */
router.get('/admin/dashboard', auth, role('admin'), aggregateController.getAdminDashboard);

/**
 * @swagger
 * /aggregate/admin/stats/users:
 *   get:
 *     summary: إحصائيات المستخدمين للمشرف
 *     tags: [📈 Aggregates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات المستخدمين
 */
router.get('/admin/stats/users', auth, role('admin'), aggregateController.getAdminUserStats);

/**
 * @swagger
 * /aggregate/admin/stats/orders:
 *   get:
 *     summary: إحصائيات الطلبات للمشرف
 *     tags: [📈 Aggregates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الطلبات
 */
router.get('/admin/stats/orders', auth, role('admin'), aggregateController.getAdminOrderStats);

/**
 * @swagger
 * /aggregate/admin/stats/revenue:
 *   get:
 *     summary: إحصائيات الإيرادات للمشرف
 *     tags: [📈 Aggregates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الإيرادات
 */
router.get('/admin/stats/revenue', auth, role('admin'), aggregateController.getAdminRevenueStats);

/**
 * @swagger
 * /aggregate/orders/admin:
 *   get:
 *     summary: جميع الطلبات للمشرف مع pagination
 *     tags: [📈 Aggregates]
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
router.get('/orders/admin', auth, role('admin'), PaginationUtils.validatePaginationParams, aggregateController.getOrdersPaginatedAdmin);

// ========== 3. تقارير متقدمة (Admin فقط) ==========

/**
 * @swagger
 * /aggregate/reports/orders:
 *   get:
 *     summary: تصدير تقرير الطلبات
 *     tags: [📈 Aggregates]
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
router.get('/reports/orders', auth, role('admin'), aggregateController.exportOrdersReport);

/**
 * @swagger
 * /aggregate/reports/users:
 *   get:
 *     summary: تصدير تقرير المستخدمين
 *     tags: [📈 Aggregates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تقرير المستخدمين
 */
router.get('/reports/users', auth, role('admin'), aggregateController.exportUsersReport);

/**
 * @swagger
 * /aggregate/reports/revenue:
 *   get:
 *     summary: تصدير تقرير الإيرادات
 *     tags: [📈 Aggregates]
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
router.get('/reports/revenue', auth, role('admin'), aggregateController.exportRevenueReport);

/**
 * @swagger
 * /aggregate/reports/drivers:
 *   get:
 *     summary: تصدير تقرير المندوبين
 *     tags: [📈 Aggregates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تقرير المندوبين
 */
router.get('/reports/drivers', auth, role('admin'), aggregateController.exportDriversReport);

/**
 * @swagger
 * /aggregate/reports/stores:
 *   get:
 *     summary: تصدير تقرير المتاجر
 *     tags: [📈 Aggregates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تقرير المتاجر
 */
router.get('/reports/stores', auth, role('admin'), aggregateController.exportStoresReport);

// ========== 4. إحصائيات متقدمة (Admin فقط) ==========

/**
 * @swagger
 * /aggregate/advanced-stats/daily:
 *   get:
 *     summary: إحصائيات يومية متقدمة
 *     tags: [📈 Aggregates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات اليوم
 */
router.get('/advanced-stats/daily', auth, role('admin'), aggregateController.getDailyAdvancedStats);

/**
 * @swagger
 * /aggregate/advanced-stats/weekly:
 *   get:
 *     summary: إحصائيات أسبوعية متقدمة
 *     tags: [📈 Aggregates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الأسبوع
 */
router.get('/advanced-stats/weekly', auth, role('admin'), aggregateController.getWeeklyAdvancedStats);

/**
 * @swagger
 * /aggregate/advanced-stats/monthly:
 *   get:
 *     summary: إحصائيات شهرية متقدمة
 *     tags: [📈 Aggregates]
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
router.get('/advanced-stats/monthly', auth, role('admin'), aggregateController.getMonthlyAdvancedStats);

/**
 * @swagger
 * /aggregate/advanced-stats/custom:
 *   get:
 *     summary: إحصائيات مخصصة حسب الفترة
 *     tags: [📈 Aggregates]
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
router.get('/advanced-stats/custom', auth, role('admin'), aggregateController.getCustomStats);

module.exports = router;