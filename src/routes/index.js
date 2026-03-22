// ============================================
// ملف: src/routes/index.js (المصحح)
// الوصف: تجميع جميع المسارات حسب الدور
// ============================================

const express = require('express');
const router = express.Router();

// ========== مسارات عامة (لا تحتاج توثيق) ==========
router.use('/public', require('./public.routes'));

// ========== مسارات المصادقة ==========
router.use('/auth', require('./auth.routes'));

// ========== مسارات محمية حسب الدور ==========
router.use('/client', require('./client.routes'));
router.use('/vendor', require('./vendor.routes'));
router.use('/driver', require('./driver.routes'));
router.use('/admin', require('./admin.routes'));

// ========== مسارات إضافية ==========
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

// ========== مسار ترحيب ==========
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Food Delivery API v1',
    version: '1.0.0',
    documentation: '/api-docs',
    endpoints: {
      public: '/api/v1/public',
      client: '/api/v1/client',
      vendor: '/api/v1/vendor',
      driver: '/api/v1/driver',
      admin: '/api/v1/admin'
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;