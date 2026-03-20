// ============================================
// ملف: src/routes/client.routes.js (مصحح)
// ============================================

const express = require('express');
const router = express.Router();

// ✅ استيراد الـ Controllers
const { 
  userController,
  orderController,
  addressController,
  favoriteController,
  reviewController,
  loyaltyController,
  notificationController
} = require('../controllers');

// ✅ استيراد الـ middlewares
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const upload = require('../middlewares/upload'); // ✅ تأكد من استيراد upload
const PaginationUtils = require('../utils/pagination.util');

// جميع مسارات العميل تحتاج توثيق
router.use(auth);
router.use(role('client'));

// ========== 1. الملف الشخصي ==========
router.get('/profile', userController.getMyProfile);
router.get('/profile/complete', userController.getMyCompleteProfile);
router.put('/profile', userController.updateMyProfile);
router.put('/profile/complete', userController.updateCompleteProfile);
// router.put('/profile/avatar', upload('users/avatars').single('image'), userController.uploadAvatar); // مؤقتاً نعطلها
// router.put('/profile/cover', upload('users/covers').single('image'), userController.updateCoverImage); // مؤقتاً نعطلها
// router.delete('/profile/avatar', userController.deleteAvatar); // مؤقتاً نعطلها
router.put('/profile/password', userController.changePassword);
router.put('/profile/presence', userController.updatePresence);

// ========== 2. الطلبات ==========
router.get('/orders', PaginationUtils.validatePaginationParams, orderController.getMyOrdersPaginated);
router.post('/orders', orderController.createOrder);
router.get('/orders/:id', orderController.getOrderDetails);
router.put('/orders/:id/cancel', orderController.cancelOrder);
router.get('/orders/:id/track', orderController.trackOrder);
router.post('/orders/:id/rate', orderController.rateOrder);
router.post('/orders/:id/report-issue', orderController.reportOrderIssue);

// ========== 3. العناوين ==========
router.get('/addresses', addressController.getMyAddresses);
router.post('/addresses', addressController.createAddress);
router.put('/addresses/:id', addressController.updateAddress);
router.delete('/addresses/:id', addressController.deleteAddress);
router.put('/addresses/:id/set-default', addressController.setDefaultAddress);
router.get('/addresses/:id', addressController.getAddressById);

// ========== 4. المفضلة ==========
router.get('/favorites', favoriteController.getUserFavorites);
router.post('/favorites/:storeId', favoriteController.addToFavorites);
router.delete('/favorites/:storeId', favoriteController.removeFromFavorites);
router.get('/favorites/:storeId/status', favoriteController.checkFavoriteStatus);
router.put('/favorites/:storeId', favoriteController.updateFavorite);

// ========== 5. التقييمات ==========
router.post('/reviews/:storeId', reviewController.addReview);

// ========== 6. نقاط الولاء ==========
router.get('/loyalty/points', loyaltyController.getPoints);
router.get('/loyalty/rewards', loyaltyController.getRewards);
router.get('/loyalty/transactions', loyaltyController.getTransactions);
router.post('/loyalty/redeem', loyaltyController.redeemPoints);
router.get('/loyalty/stats', loyaltyController.getStats);

// ========== 7. الإشعارات ==========
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

// ========== 8. إحصائيات ==========
router.get('/stats', userController.getUserStats);
router.get('/activity', PaginationUtils.validatePaginationParams, userController.getActivityLog);

module.exports = router;