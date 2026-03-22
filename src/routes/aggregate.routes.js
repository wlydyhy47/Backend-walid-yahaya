// ============================================
// ملف: src/routes/aggregate.routes.js (المُنظم - بعد إزالة المسارات العامة)
// الوصف: مسارات التجميع والبيانات المركبة (تتطلب توثيق)
// ============================================

const express = require('express');
const router = express.Router();

// ✅ استيراد موحد
const { aggregateController } = require('../controllers');

// الـ middlewares
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const PaginationUtils = require('../utils/pagination.util');

// ========== ملاحظة: المسارات العامة (home, search, stats) ==========
// تم نقلها إلى public.routes.js

// ========== 1. مسارات تحتاج توثيق (مستخدمين مسجلين) ==========
/**
 * @route   GET /api/aggregate/dashboard
 * @desc    لوحة تحكم المستخدم (بيانات مخصصة حسب الدور)
 * @access  Private (Client, Vendor, Driver)
 */
router.get('/dashboard', auth, aggregateController.getDashboardData);

/**
 * @route   GET /api/aggregate/stores/:id/full
 * @desc    تفاصيل كاملة للمتجر مع بيانات إضافية للمستخدم المسجل
 * @access  Private (مع معلومات إضافية)
 */
router.get('/stores/:id/full', auth, aggregateController.getStoreDetails);

/**
 * @route   GET /api/aggregate/orders/:id/full
 * @desc    تفاصيل كاملة للطلب مع التتبع
 * @access  Private (Client, Vendor, Driver, Admin حسب الصلاحية)
 */
router.get('/orders/:id/full', auth, aggregateController.getOrderWithTracking);

// ========== 2. مسارات Pagination ==========
/**
 * @route   GET /api/aggregate/stores
 * @desc    المتاجر مع pagination (بيانات محسنة للمستخدمين المسجلين)
 * @access  Private
 */
router.get('/stores', auth, PaginationUtils.validatePaginationParams, aggregateController.getStoresPaginated);

/**
 * @route   GET /api/aggregate/items
 * @desc    العناصر مع pagination
 * @access  Private
 */
router.get('/items', auth, PaginationUtils.validatePaginationParams, aggregateController.getItemsPaginated);

/**
 * @route   GET /api/aggregate/orders/me
 * @desc    طلبات المستخدم الحالي مع pagination
 * @access  Private
 */
router.get('/orders/me', auth, PaginationUtils.validatePaginationParams, aggregateController.getMyOrdersPaginated);

// ========== 3. مسارات الأدمن فقط ==========
/**
 * @route   GET /api/aggregate/admin/dashboard
 * @desc    لوحة تحكم المشرف
 * @access  Admin
 */
router.get('/admin/dashboard', auth, role('admin'), aggregateController.getAdminDashboard);

/**
 * @route   GET /api/aggregate/admin/stats/users
 * @desc    إحصائيات المستخدمين للمشرف
 * @access  Admin
 */
router.get('/admin/stats/users', auth, role('admin'), aggregateController.getAdminUserStats);

/**
 * @route   GET /api/aggregate/admin/stats/orders
 * @desc    إحصائيات الطلبات للمشرف
 * @access  Admin
 */
router.get('/admin/stats/orders', auth, role('admin'), aggregateController.getAdminOrderStats);

/**
 * @route   GET /api/aggregate/admin/stats/revenue
 * @desc    إحصائيات الإيرادات للمشرف
 * @access  Admin
 */
router.get('/admin/stats/revenue', auth, role('admin'), aggregateController.getAdminRevenueStats);

/**
 * @route   GET /api/aggregate/orders/admin
 * @desc    جميع الطلبات للمشرف مع pagination
 * @access  Admin
 */
router.get('/orders/admin', auth, role('admin'), PaginationUtils.validatePaginationParams, aggregateController.getOrdersPaginatedAdmin);

// ========== 4. إدارة الكاش (Admin فقط) ==========
/**
 * @route   GET /api/aggregate/cache/stats
 * @desc    إحصائيات الكاش
 * @access  Admin
 */
router.get('/cache/stats', auth, role('admin'), aggregateController.getCacheStats);

/**
 * @route   POST /api/aggregate/cache/clear
 * @desc    مسح الكاش بالكامل
 * @access  Admin
 */
router.post('/cache/clear', auth, role('admin'), aggregateController.clearCache);

/**
 * @route   POST /api/aggregate/cache/clear/:pattern
 * @desc    مسح الكاش حسب النمط
 * @access  Admin
 */
router.post('/cache/clear/:pattern', auth, role('admin'), aggregateController.clearCachePattern);

// ========== 5. تقارير متقدمة (Admin فقط) ==========
/**
 * @route   GET /api/aggregate/reports/orders
 * @desc    تصدير تقرير الطلبات
 * @access  Admin
 */
router.get('/reports/orders', auth, role('admin'), aggregateController.exportOrdersReport);

/**
 * @route   GET /api/aggregate/reports/users
 * @desc    تصدير تقرير المستخدمين
 * @access  Admin
 */
router.get('/reports/users', auth, role('admin'), aggregateController.exportUsersReport);

/**
 * @route   GET /api/aggregate/reports/revenue
 * @desc    تصدير تقرير الإيرادات
 * @access  Admin
 */
router.get('/reports/revenue', auth, role('admin'), aggregateController.exportRevenueReport);

/**
 * @route   GET /api/aggregate/reports/drivers
 * @desc    تصدير تقرير المندوبين
 * @access  Admin
 */
router.get('/reports/drivers', auth, role('admin'), aggregateController.exportDriversReport);

/**
 * @route   GET /api/aggregate/reports/stores
 * @desc    تصدير تقرير المتاجر
 * @access  Admin
 */
router.get('/reports/stores', auth, role('admin'), aggregateController.exportStoresReport);

// ========== 6. إحصائيات متقدمة (Admin فقط) ==========
/**
 * @route   GET /api/aggregate/advanced-stats/daily
 * @desc    إحصائيات يومية متقدمة
 * @access  Admin
 */
router.get('/advanced-stats/daily', auth, role('admin'), aggregateController.getDailyAdvancedStats);

/**
 * @route   GET /api/aggregate/advanced-stats/weekly
 * @desc    إحصائيات أسبوعية متقدمة
 * @access  Admin
 */
router.get('/advanced-stats/weekly', auth, role('admin'), aggregateController.getWeeklyAdvancedStats);

/**
 * @route   GET /api/aggregate/advanced-stats/monthly
 * @desc    إحصائيات شهرية متقدمة
 * @access  Admin
 */
router.get('/advanced-stats/monthly', auth, role('admin'), aggregateController.getMonthlyAdvancedStats);

/**
 * @route   GET /api/aggregate/advanced-stats/custom
 * @desc    إحصائيات مخصصة حسب الفترة
 * @access  Admin
 */
router.get('/advanced-stats/custom', auth, role('admin'), aggregateController.getCustomStats);

module.exports = router;