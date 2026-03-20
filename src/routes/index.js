// ============================================
// ملف: src/routes/index.js (المحدث)
// الوصف: تجميع جميع المسارات حسب الدور
// ============================================

const express = require('express');
const router = express.Router();

// ========== مسارات عامة (لا تحتاج توثيق) ==========
router.use('/public', require('./public.routes'));

// ========== مسارات محمية حسب الدور ==========
router.use('/client', require('./client.routes'));
router.use('/vendor', require('./vendor.routes'));
router.use('/driver', require('./driver.routes'));
router.use('/admin', require('./admin.routes'));

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