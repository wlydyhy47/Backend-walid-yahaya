// ============================================
// ملف: src/routes/api.js
// الوصف: تنظيم المسارات حسب الإصدارات
// ============================================

const express = require('express');
const router = express.Router();

// ========== الإصدار الأول ==========
const v1Routes = require('./index'); // المسار الرئيسي

// ========== استخدام الإصدارات ==========
router.use('/v1', v1Routes);

// ========== مسار للإصدار الافتراضي ==========
router.use('/', v1Routes); // /api -> v1

// ========== معلومات الإصدارات ==========
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Food Delivery API',
    versions: {
      v1: {
        status: 'active',
        url: '/api/v1',
        docs: '/api-docs'
      }
    },
    documentation: '/api-docs'
  });
});

module.exports = router;