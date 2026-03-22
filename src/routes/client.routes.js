// ============================================
// ملف: src/routes/client.routes.js (المصحح النهائي مع Validation)
// ============================================

const express = require('express');
const router = express.Router();

const { 
  userController,
  orderController,
  addressController,
  favoriteController,
  reviewController,
  loyaltyController,
  notificationController
} = require('../controllers');

const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const upload = require('../middlewares/upload');
const PaginationUtils = require('../utils/pagination.util');

// ✅ Validators
const {
  updateProfileSchema,
  avatarSchema,
  presenceSchema
} = require('../validators/user.validator');

const {
  createOrderSchema,
  cancelOrderSchema,
  rateOrderSchema,
  reportIssueSchema
} = require('../validators/order.validator');

const {
  createAddressSchema,
  updateAddressSchema
} = require('../validators/address.validator');

// ✅ فقط التحقق من التوكن
router.use(auth);

// ========== 1. الملف الشخصي (متاح لجميع المستخدمين) ==========
router.get('/profile', userController.getMyProfile);
router.get('/profile/complete', userController.getMyCompleteProfile);
router.put('/profile', validate(updateProfileSchema), userController.updateMyProfile);
router.put('/profile/complete', validate(updateProfileSchema), userController.updateCompleteProfile);
router.put('/profile/avatar', 
  validate(avatarSchema),
  upload('users/avatars', ['image']).single('image'), 
  userController.uploadAvatar
);
router.put('/profile/cover', 
  upload('users/covers', ['image']).single('image'), 
  userController.updateCoverImage
);
router.delete('/profile/avatar', userController.deleteAvatar);
router.put('/profile/password', userController.changePassword);
router.put('/profile/presence', validate(presenceSchema), userController.updatePresence);

// ========== 2. الطلبات (فقط العملاء) ==========
router.get('/orders', role('client'), PaginationUtils.validatePaginationParams, orderController.getMyOrdersPaginated);
router.post('/orders', role('client'), validate(createOrderSchema), orderController.createOrder);
router.get('/orders/:id', role('client'), orderController.getOrderDetails);
router.put('/orders/:id/cancel', role('client'), validate(cancelOrderSchema), orderController.cancelOrder);
router.get('/orders/:id/track', role('client'), orderController.trackOrder);
router.post('/orders/:id/rate', role('client'), validate(rateOrderSchema), orderController.rateOrder);
router.post('/orders/:id/report-issue', role('client'), validate(reportIssueSchema), orderController.reportOrderIssue);

// ========== 3. العناوين (فقط العملاء) ==========
router.get('/addresses', role('client'), addressController.getMyAddresses);
router.post('/addresses', role('client'), validate(createAddressSchema), addressController.createAddress);
router.put('/addresses/:id', role('client'), validate(updateAddressSchema), addressController.updateAddress);
router.delete('/addresses/:id', role('client'), addressController.deleteAddress);
router.put('/addresses/:id/set-default', role('client'), addressController.setDefaultAddress);
router.get('/addresses/:id', role('client'), addressController.getAddressById);

// ========== 4. المفضلة (فقط العملاء) ==========
router.get('/favorites', role('client'), favoriteController.getUserFavorites);
router.post('/favorites/:storeId', role('client'), favoriteController.addToFavorites);
router.delete('/favorites/:storeId', role('client'), favoriteController.removeFromFavorites);
router.get('/favorites/:storeId/status', role('client'), favoriteController.checkFavoriteStatus);
router.put('/favorites/:storeId', role('client'), favoriteController.updateFavorite);

// ========== 5. التقييمات (فقط العملاء) ==========
router.post('/reviews/:storeId', role('client'), reviewController.addReview);

// ========== 6. نقاط الولاء (فقط العملاء) ==========
router.get('/loyalty/points', role('client'), loyaltyController.getPoints);
router.get('/loyalty/rewards', role('client'), loyaltyController.getRewards);
router.get('/loyalty/transactions', role('client'), loyaltyController.getTransactions);
router.post('/loyalty/redeem', role('client'), loyaltyController.redeemPoints);
router.get('/loyalty/stats', role('client'), loyaltyController.getStats);

// ========== 7. الإشعارات (متاح لجميع المستخدمين) ==========
router.get('/notifications', PaginationUtils.validatePaginationParams, notificationController.getUserNotifications);
router.get('/notifications/unread-count', notificationController.getUnreadCount);
router.get('/notifications/stats', notificationController.getNotificationStats);
router.put('/notifications/:id/read', notificationController.markAsRead);
router.put('/notifications/:id/unread', notificationController.markAsUnread);
router.put('/notifications/:id/archive', notificationController.archive);
router.delete('/notifications/:id', notificationController.deleteNotification);
router.put('/notifications/mark-all-read', notificationController.markAllAsRead);
router.delete('/notifications/read/cleanup', notificationController.deleteReadNotifications);
router.put('/notifications/preferences', notificationController.updateNotificationPreferences);
router.post('/notifications/devices', notificationController.registerDevice);
router.delete('/notifications/devices/:deviceId', notificationController.unregisterDevice);

// ========== 8. إحصائيات (متاح لجميع المستخدمين) ==========
router.get('/stats', userController.getUserStats);
router.get('/activity', PaginationUtils.validatePaginationParams, userController.getActivityLog);

module.exports = router;