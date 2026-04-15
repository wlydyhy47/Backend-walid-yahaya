const express = require("express");
const router = express.Router();

const { orderController } = require('../controllers');
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const { storeVendorMiddleware, driverMiddleware } = require("../middlewares/role.middleware");
const validate = require('../middlewares/validate.middleware');
const { noCache } = require('../middlewares/cache.middleware');
const PaginationUtils = require('../utils/pagination.util');

const {
  createOrderSchema,
  updateStatusSchema,
  cancelOrderSchema,
  rateOrderSchema,
  reportIssueSchema,
  assignDriverSchema
} = require('../validators/order.validator');

router.get('/me', auth, role('client'), PaginationUtils.validatePaginationParams, orderController.getMyOrdersPaginated);

router.post("/", auth, role("client"), validate(createOrderSchema), orderController.createOrder);

router.get("/:id", auth, orderController.getOrderDetails);

router.put("/:id/cancel", auth, role("client"), validate(cancelOrderSchema), orderController.cancelOrder);

router.get("/track/:id", auth, orderController.trackOrder);

router.post("/:id/rate", auth, role('client'), validate(rateOrderSchema), orderController.rateOrder);

router.post("/:id/report-issue", auth, validate(reportIssueSchema), orderController.reportOrderIssue);

router.get("/:id/location", auth, orderController.getDriverLocation);

router.get("/:id/timeline", auth, orderController.getOrderTimeline);

router.get('/driver/deliveries', auth, driverMiddleware, PaginationUtils.validatePaginationParams, orderController.getDriverOrders);

router.get('/driver/current-delivery', auth, driverMiddleware, orderController.getCurrentDelivery);

router.put("/driver/:id/status", auth, driverMiddleware, noCache, validate(updateStatusSchema), orderController.updateStatus);

router.post("/driver/:id/location", auth, driverMiddleware, orderController.updateDriverLocation);

router.get('/driver/earnings', auth, driverMiddleware, orderController.getDriverEarnings);

router.get('/vendor/orders', auth, storeVendorMiddleware, PaginationUtils.validatePaginationParams, orderController.getVendorOrders);

router.get('/vendor/orders/stats', auth, storeVendorMiddleware, orderController.getVendorOrderStats);

router.get('/vendor/orders/today', auth, storeVendorMiddleware, orderController.getTodayOrders);

router.put("/vendor/:id/accept", auth, storeVendorMiddleware, orderController.acceptOrder);

router.put("/vendor/:id/reject", auth, storeVendorMiddleware, orderController.rejectOrder);

router.put("/vendor/:id/mark-ready", auth, storeVendorMiddleware, orderController.markOrderReady);

router.put("/vendor/:id/start-preparing", auth, storeVendorMiddleware, orderController.startPreparing);

router.get('/admin/orders', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getAllOrdersPaginated);

router.get('/admin/orders/stats/overview', auth, role('admin'), orderController.getOrderStats);

router.get('/admin/orders/stats/daily', auth, role('admin'), orderController.getDailyStats);

router.get('/admin/orders/stats/monthly', auth, role('admin'), orderController.getMonthlyStats);

router.put("/admin/:id/assign", auth, role("admin"), validate(assignDriverSchema), orderController.assignDriver);

router.put("/admin/:id/reassign", auth, role("admin"), orderController.reassignDriver);

router.put("/admin/:id/force-cancel", auth, role("admin"), validate(cancelOrderSchema), orderController.forceCancelOrder);

router.get('/admin/drivers/:id/orders', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getDriverOrdersById);

router.get('/admin/stores/:id/orders', auth, role('admin'), PaginationUtils.validatePaginationParams, orderController.getStoreOrdersById);

module.exports = router;