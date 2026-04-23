const express = require('express');
const router = express.Router();

const { 
  userController,
  storeController,
  productController,
  orderController,
  driverController,
  vendorController,
  aggregateController,
  notificationController,
  analyticsController,
  securityController
} = require('../controllers');

const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const handleFormData = require('../middlewares/formDataHandler');
const validate = require('../middlewares/validate.middleware');
const rateLimiter = require('../middlewares/rateLimit.middleware');
const upload = require('../middlewares/upload');
const PaginationUtils = require('../utils/pagination.util');

const {
  createUserSchema,
  updateUserByAdminSchema
} = require('../validators/user.validator');

const {
  createStoreSchema,
  updateStoreSchema
} = require('../validators/store.validator');

const {
  assignDriverSchema,
  cancelOrderSchema
} = require('../validators/order.validator');

const {
  createProductSchema,
  updateProductSchema,
  updateInventorySchema
} = require('../validators/product.validator');

router.use(auth);
router.use(role('admin'));

router.get('/dashboard', aggregateController.getAdminDashboard);
router.get('/stats', aggregateController.getAdminStats);
router.get('/stats/users', aggregateController.getAdminUserStats);
router.get('/stats/orders', aggregateController.getAdminOrderStats);
router.get('/stats/revenue', aggregateController.getAdminRevenueStats);

router.get('/users', PaginationUtils.validatePaginationParams, userController.getUsers);
router.get('/users/:id', userController.getUserById);
router.post('/users', validate(createUserSchema), userController.createUser);
router.put('/users/:id', validate(updateUserByAdminSchema), userController.updateUserById);
router.delete('/users/:id', userController.deleteUserById);

router.get('/vendors', PaginationUtils.validatePaginationParams, vendorController.getVendors);
router.get('/vendors/:id', vendorController.getVendorById);
router.put('/vendors/:id/verify', vendorController.verifyVendor);
router.put('/vendors/:id/status', vendorController.toggleVendorStatus);

router.get('/stores', PaginationUtils.validatePaginationParams, storeController.getStoresPaginated);
router.get('/stores/:id', storeController.getStoreDetails);
router.post('/stores', 
  upload('stores', ['image']).fields([        
    { name: 'logo', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
  ]),
  handleFormData,
  validate(createStoreSchema),               
  storeController.createStore                 
);
router.put('/stores/:id', 
  upload('stores', ['image']).fields([
    { name: 'logo', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
  ]),
  handleFormData,
  validate(updateStoreSchema),
  storeController.updateStore
);
router.post('/stores/update-coordinates', storeController.updateStoreCoordinates);
router.delete('/stores/:id', storeController.deleteStore);
router.put('/stores/:id/verify', storeController.verifyStore);
router.put('/stores/:id/toggle-status', storeController.toggleStoreStatus);

router.get('/products', PaginationUtils.validatePaginationParams, productController.getAllProducts);
router.get('/products/stats', productController.getProductStats);
router.get('/products/:id', productController.getProductById);
router.post('/products', 
  upload('products', ['image']).single('image'),
  handleFormData,
  validate(createProductSchema),
  productController.createProduct
);
router.put('/products/:id',
  handleFormData, 
  validate(updateProductSchema),
  productController.updateProduct
);
router.delete('/products/:id', productController.deleteProduct);
router.put('/products/:id/feature', productController.toggleFeatured);
router.put('/products/:id/image', 
  upload('products', ['image']).single('image'),
  productController.updateProductImage
);
router.put('/products/:id/toggle-availability', productController.toggleAvailability);
router.put('/products/:id/inventory', 
  validate(updateInventorySchema),
  productController.updateInventory
);

router.get('/orders', PaginationUtils.validatePaginationParams, orderController.getAllOrdersPaginated);
router.get('/orders/:id', orderController.getOrderDetails);
router.get('/orders/stats/overview', orderController.getOrderStats);
router.get('/orders/stats/daily', orderController.getDailyStats);
router.get('/orders/stats/monthly', orderController.getMonthlyStats);
router.put('/orders/:id/assign', validate(assignDriverSchema), orderController.assignDriver);
router.put('/orders/:id/reassign', orderController.reassignDriver);
router.put('/orders/:id/force-cancel', validate(cancelOrderSchema), orderController.forceCancelOrder);

router.get('/drivers/locations', driverController.getAllDriversWithLocations);
router.get('/drivers', PaginationUtils.validatePaginationParams, driverController.getDrivers);
router.get('/drivers/:id', driverController.getDriverById);
router.get('/drivers/:id/location', driverController.getDriverLocation);
router.get('/drivers/:id/stats', driverController.getDriverStatsById);
router.get('/drivers/:id/orders', PaginationUtils.validatePaginationParams, orderController.getDriverOrdersById);
router.put('/drivers/:id/verify', driverController.verifyDriver);
router.put('/drivers/:id/status', driverController.toggleDriverStatus);

router.post('/notifications/send', notificationController.sendCustomNotification);
router.get('/notifications/campaign/:campaignId/stats', notificationController.getCampaignStats);
router.get('/notifications/all/stats', notificationController.getAllNotificationsStats);

router.get('/cache/stats', aggregateController.getCacheStats);
router.post('/cache/clear', aggregateController.clearCache);
router.post('/cache/clear/:pattern', aggregateController.clearCachePattern);

router.get('/rate-limit/stats', rateLimiter.getStats);
router.post('/rate-limit/reset/:userId', rateLimiter.resetUserLimits);
router.delete('/rate-limit/clear-all', rateLimiter.clearAll);

router.get('/analytics/users', analyticsController.getUserAnalytics);
router.get('/analytics/orders', analyticsController.getOrderAnalytics);
router.get('/analytics/revenue', analyticsController.getRevenueAnalytics);

router.get('/security/headers', securityController.getSecurityHeaders);

router.get('/reports/orders', aggregateController.exportOrdersReport);
router.get('/reports/users', aggregateController.exportUsersReport);
router.get('/reports/revenue', aggregateController.exportRevenueReport);
router.get('/reports/drivers', aggregateController.exportDriversReport);
router.get('/reports/stores', aggregateController.exportStoresReport);

router.get('/advanced-stats/daily', aggregateController.getDailyAdvancedStats);
router.get('/advanced-stats/weekly', aggregateController.getWeeklyAdvancedStats);
router.get('/advanced-stats/monthly', aggregateController.getMonthlyAdvancedStats);
router.get('/advanced-stats/custom', aggregateController.getCustomStats);

module.exports = router;