// ============================================
// ملف: src/routes/index.js
// ============================================

const express = require('express');
const router = express.Router();

// ========== مسارات عامة (كلها تحت /public) ==========
router.use('/public', require('./public.routes'));

// ========== مسارات محمية حسب الدور ==========
router.use('/admin', require('./admin.routes'));
router.use('/client', require('./client.routes'));
router.use('/driver', require('./driver.routes'));
router.use('/vendor', require('./vendor.routes'));

// ========== مسارات مشتركة ==========
router.use('/addresses', require('./address.routes'));
router.use('/aggregate', require('./aggregate.routes'));
router.use('/analytics', require('./analytics.routes'));
router.use('/assets', require('./assets.routes'));
router.use('/chat', require('./chat.routes'));
router.use('/health', require('./health.routes'));
router.use('/loyalty', require('./loyalty.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/orders', require('./order.routes'));
router.use('/security', require('./security.routes'));
router.use('/users', require('./user.routes'));

// ========== مسارات الخرائط ==========
router.use('/map', require('./map.routes'));  // ✅ إضافة مسارات الخرائط

// ========== مسار ترحيب ==========
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Food Delivery API v1',
    version: '2.1.0',
    documentation: '/api-docs',
    baseUrl: '/api/v1',
    endpoints: {
      auth: '/api/v1/public/auth',
      public: '/api/v1/public',
      client: '/api/v1/client',
      vendor: '/api/v1/vendor',
      driver: '/api/v1/driver',
      admin: '/api/v1/admin',
      map: '/api/v1/map'  // ✅ إضافة map
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;