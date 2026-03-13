// ============================================
// ملف: src/routes/restaurantOwner.routes.js
// الوصف: مسارات صاحب المطعم الموحدة
// ============================================

const express = require("express");
const router = express.Router();

// ✅ استيراد موحد
const { restaurantOwnerController } = require('../controllers');

const auth = require("../middlewares/auth.middleware");
const { restaurantOwnerMiddleware } = require("../middlewares/role.middleware");
const PaginationUtils = require('../utils/pagination.util');

router.use(auth, restaurantOwnerMiddleware);

// ========== 1. لوحة التحكم ==========
router.get("/dashboard", restaurantOwnerController.getDashboard);

// ========== 2. إدارة الطلبات ==========
router.get("/orders", PaginationUtils.validatePaginationParams, restaurantOwnerController.getOrders);
router.put("/orders/:orderId/status", restaurantOwnerController.updateOrderStatus);
router.put("/orders/:orderId/accept", restaurantOwnerController.acceptOrder);
router.put("/orders/:orderId/reject", restaurantOwnerController.rejectOrder);

// ========== 3. إدارة المطعم ==========
router.put("/toggle-status", restaurantOwnerController.toggleRestaurantStatus);
router.put("/preparation-time", restaurantOwnerController.updatePreparationTime);

// ========== 4. التقارير ==========
router.get("/reports/financial", restaurantOwnerController.getFinancialReport);
router.get("/reports/performance", restaurantOwnerController.getPerformanceReport);

// ========== 5. الإعدادات ==========
router.get("/settings", restaurantOwnerController.getSettings);
router.put("/settings/notifications", restaurantOwnerController.updateNotificationSettings);
router.put("/settings/working-hours", restaurantOwnerController.updateWorkingHours);

// ========== 6. إدارة العناوين ==========
router.get("/addresses", restaurantOwnerController.getMyAddresses);
router.post("/addresses", restaurantOwnerController.createAddress);
router.get("/addresses/:id", restaurantOwnerController.getMyAddressById);
router.put("/addresses/:id", restaurantOwnerController.updateMyAddress);
router.delete("/addresses/:id", restaurantOwnerController.deleteMyAddress);

module.exports = router;