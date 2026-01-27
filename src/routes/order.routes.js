const express = require("express");
const router = express.Router();

const orderController = require("../controllers/order.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

/**
 * 🏠 العملاء فقط
 * إنشاء طلب جديد من أي عنوان إلى أي عنوان
 * POST /api/orders
 */
router.post("/", auth, role("client"), orderController.createOrder);

/**
 * 👤 العملاء فقط
 * الحصول على جميع الطلبات الخاصة بالعميل
 * GET /api/orders/me
 */
router.get("/me", auth, role("client"), orderController.getMyOrders);

/**
 * 🔑 الأدمن فقط
 * الحصول على جميع الطلبات
 * GET /api/orders
 */
router.get("/", auth, role("admin"), orderController.getAllOrders);

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
router.put("/:id/status", auth, role("driver"), orderController.updateStatus);

module.exports = router;
