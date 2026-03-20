// ============================================
// ملف: src/routes/api.js
// الوصف: تنظيم المسارات حسب الإصدارات
// ============================================

const express = require('express');
const router = express.Router();

// ========== الإصدار الأول ==========
const v1Routes = require('./index');

// ========== استخدام الإصدارات ==========
router.use('/v1', v1Routes);

// ========== مسار للإصدار الافتراضي ==========
router.use('/', v1Routes);

// ========== معلومات الإصدارات ==========
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Food Delivery API',
    versions: {
      v1: {
        status: 'active',
        url: '/api/v1',
        docs: '/api-docs',
        endpoints: {
          public: '/api/v1/public',
          client: '/api/v1/client',
          vendor: '/api/v1/vendor',
          driver: '/api/v1/driver',
          admin: '/api/v1/admin'
        }
      }
    },
    documentation: '/api-docs'
  });
});

module.exports = router;