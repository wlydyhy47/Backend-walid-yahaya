const express = require("express");
const router = express.Router();

// ✅ استيراد موحد
const { restaurantOwnerController } = require('../controllers');

const auth = require("../middlewares/auth.middleware");
const { restaurantOwnerMiddleware } = require("../middlewares/role.middleware");
const PaginationUtils = require('../utils/pagination.util');

router.use(auth, restaurantOwnerMiddleware);

router.get("/dashboard", restaurantOwnerController.getDashboard);
router.get("/orders", PaginationUtils.validatePaginationParams, restaurantOwnerController.getOrders);
router.put("/orders/:orderId/status", restaurantOwnerController.updateOrderStatus);
router.put("/toggle-status", restaurantOwnerController.toggleRestaurantStatus);
router.get("/reports/financial", restaurantOwnerController.getFinancialReport);

module.exports = router;