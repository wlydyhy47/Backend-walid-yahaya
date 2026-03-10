// ============================================
// ملف: src/routes/index.js
// الوصف: تجميع وتنظيم جميع مسارات API
// ============================================

const express = require('express');
const router = express.Router();

// ========== 1. استيراد جميع المسارات ==========
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const userCompleteRoutes = require('./userComplete.routes');
const restaurantRoutes = require('./restaurant.routes');
const restaurantCompleteRoutes = require('./restaurantComplete.routes');
const restaurantOwnerRoutes = require('./restaurantOwner.routes');
const orderRoutes = require('./order.routes');
const itemRoutes = require('./item.routes');
const addressRoutes = require('./address.routes');
const restaurantAddressRoutes = require('./restaurantAddress.routes');
const notificationRoutes = require('./notification.routes');
const chatRoutes = require('./chat.routes');
const adminRoutes = require('./admin.routes');
const aggregateRoutes = require('./aggregate.routes');
const reviewRoutes = require('./review.routes');
const favoriteRoutes = require('./favorite.routes');
const healthRoutes = require('./health.routes');
const driverRoutes = require('./driver.routes');
const loyaltyRoutes = require('./loyalty.routes');
const analyticsRoutes = require('./analytics.routes');
const securityRoutes = require('./security.routes');
const performanceRoutes = require('./performance.routes');
const assetsRoutes = require('./assets.routes');

// ========== 2. تجميع المسارات حسب المجموعات ==========

/**
 * 🧑‍💼 مسارات المصادقة والمستخدمين
 * BASE PATH: /api/v1/auth
 */
router.use('/auth', authRoutes);

/**
 * 👤 مسارات المستخدمين
 * BASE PATH: /api/v1/users
 */
router.use('/users', userRoutes);
router.use('/users/complete', userCompleteRoutes);

/**
 * 🍽️ مسارات المطاعم
 * BASE PATH: /api/v1/restaurants
 */
router.use('/restaurants', restaurantRoutes);
router.use('/restaurants/complete', restaurantCompleteRoutes);
router.use('/restaurant-owner', restaurantOwnerRoutes);

/**
 * 📦 مسارات الطلبات
 * BASE PATH: /api/v1/orders
 */
router.use('/orders', orderRoutes);

/**
 * 🍲 مسارات العناصر
 * BASE PATH: /api/v1/items
 */
router.use('/items', itemRoutes);

/**
 * 📍 مسارات العناوين
 * BASE PATH: /api/v1/addresses
 */
router.use('/addresses', addressRoutes);
router.use('/restaurant-addresses', restaurantAddressRoutes);

/**
 * 🔔 مسارات الإشعارات
 * BASE PATH: /api/v1/notifications
 */
router.use('/notifications', notificationRoutes);

/**
 * 💬 مسارات الدردشة
 * BASE PATH: /api/v1/chat
 */
router.use('/chat', chatRoutes);

/**
 * 👑 مسارات الأدمن
 * BASE PATH: /api/v1/admin
 */
router.use('/admin', adminRoutes);

/**
 * 📊 مسارات التجميع والتحليلات
 * BASE PATH: /api/v1/aggregate
 */
router.use('/aggregate', aggregateRoutes);

/**
 * ⭐ مسارات التقييمات
 * BASE PATH: /api/v1/reviews
 */
router.use('/reviews', reviewRoutes);

/**
 * ❤️ مسارات المفضلة
 * BASE PATH: /api/v1/favorites
 */
router.use('/favorites', favoriteRoutes);

/**
 * 🚚 مسارات المندوبين
 * BASE PATH: /api/v1/driver
 */
router.use('/driver', driverRoutes);

/**
 * 🏆 مسارات الولاء
 * BASE PATH: /api/v1/loyalty
 */
router.use('/loyalty', loyaltyRoutes);

/**
 * 📈 مسارات التحليلات
 * BASE PATH: /api/v1/analytics
 */
router.use('/analytics', analyticsRoutes);

/**
 * 🔒 مسارات الأمان
 * BASE PATH: /api/v1/security
 */
router.use('/security', securityRoutes);

/**
 * ⚡ مسارات الأداء
 * BASE PATH: /api/v1/performance
 */
router.use('/performance', performanceRoutes);

/**
 * 🖼️ مسارات الملفات الثابتة
 * BASE PATH: /api/v1/assets
 */
router.use('/assets', assetsRoutes);

/**
 * ❤️ مسارات الصحة
 * BASE PATH: /api/v1/health
 */
router.use('/health', healthRoutes);

// ========== 3. مسار ترحيب للـ API ==========
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Food Delivery API v1',
    version: '1.0.0',
    documentation: '/api-docs',
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      restaurants: '/api/v1/restaurants',
      orders: '/api/v1/orders',
      chat: '/api/v1/chat',
      admin: '/api/v1/admin',
      health: '/api/v1/health'
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;