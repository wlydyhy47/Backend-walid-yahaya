// ============================================
// ملف: src/routes/index.js (النسخة النهائية)
// ============================================

const express = require('express');
const router = express.Router();

// ========== استيراد جميع المسارات ==========
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const restaurantRoutes = require('./restaurant.routes');
const orderRoutes = require('./order.routes');
const itemRoutes = require('./item.routes');
const addressRoutes = require('./address.routes');
const notificationRoutes = require('./notification.routes');
const chatRoutes = require('./chat.routes');
const adminRoutes = require('./admin.routes');
const aggregateRoutes = require('./aggregate.routes');
const restaurantOwnerRoutes = require('./restaurantOwner.routes');
const driverRoutes = require('./driver.routes');
const loyaltyRoutes = require('./loyalty.routes');
const analyticsRoutes = require('./analytics.routes');
const securityRoutes = require('./security.routes');
const assetsRoutes = require('./assets.routes');
const healthRoutes = require('./health.routes');

// ========== تجميع المسارات ==========
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/restaurants', restaurantRoutes);
router.use('/orders', orderRoutes);
router.use('/items', itemRoutes);
router.use('/addresses', addressRoutes);
router.use('/notifications', notificationRoutes);
router.use('/chat', chatRoutes);
router.use('/admin', adminRoutes);
router.use('/aggregate', aggregateRoutes);
router.use('/restaurant-owner', restaurantOwnerRoutes);
router.use('/driver', driverRoutes);
router.use('/loyalty', loyaltyRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/security', securityRoutes);
router.use('/assets', assetsRoutes);
router.use('/health', healthRoutes);

// ========== مسار ترحيب ==========
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
      admin: '/api/v1/admin'
    },
    timestamp: new Date().toISOString()
  });
});


console.log('📋 Routes in index.js:');
console.log('  - /auth');
console.log('  - /auth/register (should be in auth.routes.js)');


module.exports = router;