const express = require("express");
const router = express.Router();

const orderController = require("../controllers/order.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const { noCache } = require('../middlewares/cache.middleware');
const PaginationUtils = require('../utils/pagination.util');
const { validateOrder } = require('../middlewares/validation.middleware');

/**
 * 🏠 العملاء فقط
 * إنشاء طلب جديد من أي عنوان إلى أي عنوان
 * POST /api/orders
 */
router.post("/", auth, role("client"), validateOrder, orderController.createOrder);

/**
 * 👤 العملاء فقط - مع Pagination
 * GET /api/orders/me
 */
router.get('/me', auth, role('client'), PaginationUtils.validatePaginationParams, orderController.getMyOrdersPaginated);

/**
 * 🔑 الأدمن فقط - مع Pagination
 * GET /api/orders
 */
router.get('/', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getAllOrdersPaginated);

/**
 * 🔧 الأدمن فقط
 * إعادة تعيين المندوب تلقائيًا
 * PUT /api/orders/:orderId/reassign
 */
router.put("/:orderId/reassign", auth, role("admin"), orderController.reassignDriver);

/**
 * 🔧 الأدمن فقط
 * تعيين مندوب يدويًا
 * PUT /api/orders/:id/assign
 */
router.put("/:id/assign", auth, role("admin"), orderController.assignDriver);

/**
 * 🚚 المندوب فقط
 * تحديث حالة الطلب
 * PUT /api/orders/:id/status
 */
router.put("/:id/status", auth, role("driver"), noCache, orderController.updateStatus);

/**
 * 🚚 المندوب فقط
 * تحديث موقع المندوب
 * POST /api/orders/:id/location
 */
router.post("/:id/location", auth, role("driver"), orderController.updateDriverLocation);

/**
 * ❌ إلغاء الطلب (العميل فقط)
 * PUT /api/orders/:id/cancel
 */
router.put("/:id/cancel", auth, role("client"), orderController.cancelOrder);

/**
 * 🚚 المندوب فقط
 * الحصول على طلبات المندوب
 * GET /api/orders/driver/me
 */
router.get("/driver/me", auth, role("driver"), PaginationUtils.validatePaginationParams, orderController.getDriverOrders);

/**
 * 📋 الحصول على تفاصيل طلب معين
 * GET /api/orders/:id
 */
router.get("/:id", auth, async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    const order = await Order.findById(orderId)
      .populate('user', 'name phone')
      .populate('driver', 'name phone')
      .populate('restaurant', 'name image')
      .populate('pickupAddress')
      .populate('deliveryAddress');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود'
      });
    }

    // التحقق من الصلاحيات
    const isOwner = order.user._id.toString() === userId;
    const isDriver = order.driver && order.driver._id.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (!isOwner && !isDriver && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بالوصول إلى هذا الطلب'
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب بيانات الطلب'
    });
  }
});

module.exports = router;