// ============================================
// ملف: src/routes/index.js
// الوصف: تنظيم جميع المسارات بشكل مركزي
// ============================================

const express = require('express');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: 🚀 API
 *   description: المسارات الرئيسية للتطبيق
 */

// ========== مسارات المصادقة (مباشرة) ==========
router.use('/auth', require('./auth.routes'));

// ========== مسارات عامة (لا تحتاج توثيق) ==========
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
router.use('/map', require('./map.routes'));

// ========== مسار ترحيب ==========
/**
 * @swagger
 * /:
 *   get:
 *     summary: معلومات API
 *     tags: [🚀 API]
 *     responses:
 *       200:
 *         description: معلومات الإصدار والمسارات المتاحة
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 version:
 *                   type: string
 *                 documentation:
 *                   type: string
 *                 baseUrl:
 *                   type: string
 *                 endpoints:
 *                   type: object
 *                   properties:
 *                     auth:
 *                       type: string
 *                     public:
 *                       type: string
 *                     client:
 *                       type: string
 *                     vendor:
 *                       type: string
 *                     driver:
 *                       type: string
 *                     admin:
 *                       type: string
 *                     map:
 *                       type: string
 *                 timestamp:
 *                   type: string
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Food Delivery API v2.1',
    version: '2.1.0',
    documentation: '/api-docs',
    baseUrl: '/api/v1',
    endpoints: {
      auth: '/api/v1/auth',
      public: '/api/v1/public',
      client: '/api/v1/client',
      vendor: '/api/v1/vendor',
      driver: '/api/v1/driver',
      admin: '/api/v1/admin',
      map: '/api/v1/map'
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;