// ============================================
// ملف: src/controllers/index.js (المحدث)
// ============================================

// ========== 1. استيراد جميع الـ Controllers ==========

// 📦 الأساسية
const authController = require('./auth.controller');
const userController = require('./user.controller');
const storeController = require('./store.controller');
const productController = require('./product.controller');
const orderController = require('./order.controller');
const addressController = require('./address.controller');

// 💬 التواصل
const chatController = require('./chat.controller');
const notificationController = require('./notification.controller');

// 📊 التحليلات والتجميع
const aggregateController = require('./aggregate.controller');

// 👑 خاصة
const vendorController = require('./vendor.controller');

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

// 🗺️ خرائط
const mapController = require('./map.controller'); // ✅ إضافة mapController

// ========== 2. تصدير موحد ==========

module.exports = {
  // 📦 الأساسية
  authController,
  userController,
  storeController,
  productController,
  orderController,
  addressController,
  
  // 💬 التواصل
  chatController,
  notificationController,
  
  // 📊 التحليلات
  aggregateController,
  
  // 👑 الخاصة
  vendorController,
  
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
  
  // 🗺️ الخرائط
  mapController,  // ✅ تصدير mapController
  
  // ========== 3. دوال مساعدة ==========
  
  /**
   * الحصول على Controller معين
   */
  getController: (name) => {
    const controllers = {
      auth: authController,
      user: userController,
      store: storeController,
      product: productController,
      order: orderController,
      address: addressController,
      chat: chatController,
      notification: notificationController,
      aggregate: aggregateController,
      vendor: vendorController,
      review: reviewController,
      favorite: favoriteController,
      driver: driverController,
      loyalty: loyaltyController,
      analytics: analyticsController,
      security: securityController,
      assets: assetsController,
      health: healthController,
      map: mapController  // ✅ إضافة map
    };
    
    return controllers[name] || null;
  },
  
  /**
   * قائمة بجميع الـ Controllers
   */
  listControllers: () => [
    'authController',
    'userController',
    'storeController',
    'productController',
    'orderController',
    'addressController',
    'chatController',
    'notificationController',
    'aggregateController',
    'vendorController',
    'reviewController',
    'favoriteController',
    'driverController',
    'loyaltyController',
    'analyticsController',
    'securityController',
    'assetsController',
    'healthController',
    'mapController'  // ✅ إضافة mapController
  ]
};