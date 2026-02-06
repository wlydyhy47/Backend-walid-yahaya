const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const aggregateController = require('../controllers/aggregate.controller');
const PaginationUtils = require('../utils/pagination.util');

/**
 * 📊 بيانات لوحة تحكم المستخدم
 * يحتاج: توثيق
 */
router.get('/dashboard', auth, aggregateController.getDashboardData);

/**
 * 🏪 الحصول على المطاعم مع Pagination
 * GET /api/aggregate/restaurants
 * Query params:
 * - page: رقم الصفحة (default: 1)
 * - limit: عدد العناصر في الصفحة (default: 10, max: 50)
 * - search: نص للبحث
 * - sortBy: الحقل للترتيب
 * - sortOrder: asc/desc
 * - filter[type]: فلترة حسب النوع
 * - filter[tags]: فلترة حسب الوسوم
 * - minRating: أقل تقييم
 */
router.get(
  '/restaurants',
  PaginationUtils.validatePaginationParams,
  aggregateController.getRestaurantsPaginated
);

/**
 * 🍽️ الحصول على العناصر مع Pagination
 * GET /api/aggregate/items
 * Query params إضافية:
 * - filter[restaurant]: فلترة حسب المطعم
 * - filter[category]: فلترة حسب الفئة
 * - minPrice: أقل سعر
 * - maxPrice: أعلى سعر
 * - filter[isVegetarian]: نباتي
 * - filter[isVegan]: فيغان
 */
router.get(
  '/items',
  PaginationUtils.validatePaginationParams,
  aggregateController.getItemsPaginated
);

/**
 * 📦 الحصول على الطلبات مع Pagination (للأدمن فقط)
 * GET /api/aggregate/orders/admin
 * Query params إضافية:
 * - filter[status]: حالة الطلب
 * - filter[restaurant]: المطعم
 * - filter[driver]: المندوب
 * - minDate: من تاريخ
 * - maxDate: إلى تاريخ
 */
router.get(
  '/orders/admin',
  auth,
  role('admin'),
  PaginationUtils.validatePaginationParams,
  aggregateController.getOrdersPaginatedAdmin
);

/**
 * 📊 الحصول على تقييمات مطعم مع Pagination
 * GET /api/aggregate/reviews/:restaurantId
 */
// ⚠️ لاحظ: هذه الوظيفة غير موجودة في الـ controller، سأنشئها لاحقاً

/**
 * 🏪 تفاصيل مطعم كاملة (بدون توثيق)
 */
router.get('/restaurants/:id/full', aggregateController.getRestaurantDetails);

/**
 * 📦 تفاصيل الطلب مع التتبع
 * يحتاج: توثيق + العميل فقط
 */
router.get('/orders/:id/full', auth, role('client'), aggregateController.getOrderWithTracking);

/**
 * 🏠 بيانات الصفحة الرئيسية (للعرض العام)
 */
router.get('/home', aggregateController.getHomeData);

/**
 * 🔧 بيانات لوحة تحكم الأدمن
 * يحتاج: توثيق + أدمن فقط
 */
router.get('/admin/dashboard', auth, role('admin'), async (req, res) => {
    try {
        const Order = require('../models/order.model');
        const User = require('../models/user.model');
        const Restaurant = require('../models/restaurant.model');
        const DriverLocation = require('../models/driverLocation.model');

        const [
            totalUsers,
            totalOrders,
            totalRestaurants,
            pendingOrders,
            activeDrivers,
            recentOrders
        ] = await Promise.all([
            User.countDocuments(),
            Order.countDocuments(),
            Restaurant.countDocuments(),
            Order.countDocuments({ status: 'pending' }),
            DriverLocation.distinct('driver'),
            Order.find()
                .populate('user', 'name')
                .populate('driver', 'name')
                .sort({ createdAt: -1 })
                .limit(10)
        ]);

        res.json({
            success: true,
            data: {
                stats: {
                    totalUsers,
                    totalOrders,
                    totalRestaurants,
                    pendingOrders,
                    activeDrivers: activeDrivers.length
                },
                recentOrders,
                charts: {
                    ordersByStatus: await getOrdersByStatus()
                }
            }
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to load admin dashboard' 
        });
    }
});

// دالة مساعدة داخلية
async function getOrdersByStatus() {
    try {
        const Order = require('../models/order.model');
        const result = await Order.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        return result.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {});
    } catch (error) {
        console.error('Orders by status error:', error);
        return {};
    }
}

router.post('/cache/clear', auth, role('admin'), aggregateController.clearCache);

/**
 * 📊 إحصائيات الكاش (للأدمن فقط)
 */
router.get('/cache/stats', auth, role('admin'), aggregateController.getCacheStats);

module.exports = router;