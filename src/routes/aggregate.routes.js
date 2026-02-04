const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const aggregateController = require('../controllers/aggregate.controller');

/**
 * 📊 بيانات لوحة تحكم المستخدم
 * يحتاج: توثيق
 */
router.get('/dashboard', auth, aggregateController.getDashboardData);

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
    const [
      totalUsers,
      totalOrders,
      totalRestaurants,
      pendingOrders,
      activeDrivers,
      recentOrders
    ] = await Promise.all([
      require('../models/user.model').countDocuments(),
      require('../models/order.model').countDocuments(),
      require('../models/restaurant.model').countDocuments(),
      require('../models/order.model').countDocuments({ status: 'pending' }),
      require('../models/driverLocation.model').distinct('driver'),
      require('../models/order.model').find()
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
          // يمكن إضافة بيانات للرسوم البيانية هنا
          ordersByStatus: await getOrdersByStatus()
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load admin dashboard' });
  }
});

// دالة مساعدة
async function getOrdersByStatus() {
  const Order = require('../models/order.model');
  const result = await Order.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  
  return result.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});
}

module.exports = router;