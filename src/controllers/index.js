// ============================================
// ملف: src/controllers/index.js (النسخة النهائية)
// ============================================

// ========== 1. استيراد جميع الـ Controllers ==========

// 📦 الأساسية
const authController = require('./auth.controller');
const userController = require('./user.controller');
const restaurantController = require('./restaurant.controller');
const orderController = require('./order.controller');
const itemController = require('./item.controller');
const addressController = require('./address.controller');

// 💬 التواصل
const chatController = require('./chat.controller');
const notificationController = require('./notification.controller');

// 📊 التحليلات والتجميع
const aggregateController = require('./aggregate.controller');

// 👑 خاصة
const restaurantOwnerController = require('./restaurantOwner.controller');

// ⭐ إضافية
const reviewController = require('./review.controller');
const favoriteController = require('./favorite.controller');

// 🚗 جديدة
const driverController = require('./driver.controller');
const loyaltyController = require('./loyalty.controller');
const analyticsController = require('./analytics.controller');
const securityController = require('./security.controller');
const assetsController = require('./assets.controller');
const healthController = require('./health.controller');

// ========== 2. تصدير موحد ==========

module.exports = {
  // 📦 الأساسية
  authController,
  userController,
  restaurantController,
  orderController,
  itemController,
  addressController,
  
  // 💬 التواصل
  chatController,
  notificationController,
  
  // 📊 التحليلات
  aggregateController,
  
  // 👑 الخاصة
  restaurantOwnerController,
  
  // ⭐ الإضافية
  reviewController,
  favoriteController,
  
  // 🚗 الجديدة
  driverController,
  loyaltyController,
  analyticsController,
  securityController,
  assetsController,
  healthController,
  
  // ========== 3. دوال مساعدة ==========
  
  /**
   * الحصول على Controller معين
   */
  getController: (name) => {
    const controllers = {
      auth: authController,
      user: userController,
      restaurant: restaurantController,
      order: orderController,
      item: itemController,
      address: addressController,
      chat: chatController,
      notification: notificationController,
      aggregate: aggregateController,
      restaurantOwner: restaurantOwnerController,
      review: reviewController,
      favorite: favoriteController,
      driver: driverController,
      loyalty: loyaltyController,
      analytics: analyticsController,
      security: securityController,
      assets: assetsController,
      health: healthController
    };
    
    return controllers[name] || null;
  },
  
  /**
   * قائمة بجميع الـ Controllers
   */
  listControllers: () => [
    'authController',
    'userController',
    'restaurantController',
    'orderController',
    'itemController',
    'addressController',
    'chatController',
    'notificationController',
    'aggregateController',
    'restaurantOwnerController',
    'reviewController',
    'favoriteController',
    'driverController',
    'loyaltyController',
    'analyticsController',
    'securityController',
    'assetsController',
    'healthController'
  ]
};