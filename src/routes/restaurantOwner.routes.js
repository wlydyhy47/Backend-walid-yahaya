const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const { restaurantOwnerMiddleware } = require("../middlewares/role.middleware");
const restaurantOwnerController = require("../controllers/restaurantOwner.controller");
const PaginationUtils = require("../utils/pagination.util");

// ✅ جميع المسارات تتطلب: تسجيل دخول + صلاحية صاحب مطعم
router.use(auth, restaurantOwnerMiddleware);

/**
 * 📊 لوحة التحكم الرئيسية
 */
router.get("/dashboard", restaurantOwnerController.getDashboard);

/**
 * 📋 إدارة الطلبات
 */
router.get(
  "/orders",
  PaginationUtils.validatePaginationParams,
  restaurantOwnerController.getOrders
);

router.put("/orders/:orderId/status", restaurantOwnerController.updateOrderStatus);

/**
 * 🏪 إدارة المطعم
 */
router.put("/toggle-status", restaurantOwnerController.toggleRestaurantStatus);

/**
 * 📊 التقارير
 */
router.get("/reports/financial", restaurantOwnerController.getFinancialReport);

/**
 * 🔔 الإعدادات
 */
router.get("/settings", async (req, res) => {
  try {
    const User = require("../models/user.model");
    const user = await User.findById(req.user.id)
      .select("restaurantOwnerInfo.notificationSettings restaurantOwnerInfo.workingHours")
      .lean();
    
    res.json({
      success: true,
      data: user.restaurantOwnerInfo,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "فشل جلب الإعدادات" });
  }
});

router.put("/settings/notifications", async (req, res) => {
  try {
    const User = require("../models/user.model");
    const { notificationSettings } = req.body;
    
    await User.findByIdAndUpdate(req.user.id, {
      "restaurantOwnerInfo.notificationSettings": notificationSettings,
    });
    
    res.json({
      success: true,
      message: "تم تحديث إعدادات الإشعارات",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "فشل تحديث الإعدادات" });
  }
});

module.exports = router;