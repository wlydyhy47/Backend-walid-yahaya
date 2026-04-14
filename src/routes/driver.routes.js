const express = require('express');
const router = express.Router();

const { 
  driverController,
  orderController
} = require('../controllers');

const auth = require('../middlewares/auth.middleware');
const { driverMiddleware } = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const upload = require('../middlewares/upload');
const PaginationUtils = require('../utils/pagination.util');

const {
  avatarSchema,
  presenceSchema
} = require('../validators/user.validator');

const {
  updateStatusSchema
} = require('../validators/order.validator');

router.use(auth);
router.use(driverMiddleware);

router.get('/profile', driverController.getMyProfile);

router.put('/profile/avatar', 
  validate(avatarSchema),
  upload('users/avatars', ['image']).single('image'), 
  driverController.updateAvatar
);

router.put('/profile/availability', validate(presenceSchema), driverController.toggleAvailability);

router.put('/profile/location', driverController.updateLocation);

router.get('/orders', PaginationUtils.validatePaginationParams, orderController.getDriverOrders);

router.get('/orders/available', driverController.getAvailableOrders);

router.get('/orders/active', orderController.getCurrentDelivery);

router.get('/orders/history', PaginationUtils.validatePaginationParams, orderController.getDriverOrdersHistory);

router.get('/orders/:id', orderController.getOrderDetails);

router.put('/orders/:id/accept', orderController.acceptOrderByDriver);

router.put('/orders/:id/reject', orderController.rejectOrder);

router.put('/orders/:id/status', validate(updateStatusSchema), orderController.updateStatus);

router.post('/orders/:id/start', orderController.startDelivery);

router.post('/orders/:id/complete', orderController.completeOrder);

router.put('/location', driverController.updateLocation);

router.get('/location/current', driverController.getCurrentLocation);

router.get('/location/order/:orderId', orderController.getOrderLocation);

router.get('/earnings', orderController.getDriverEarnings);

router.get('/earnings/stats', driverController.getMyStats);

router.get('/earnings/history', PaginationUtils.validatePaginationParams, driverController.getEarningsHistory);

router.get('/stats', driverController.getMyStats);

router.get('/performance', driverController.getPerformanceReport);

module.exports = router;