// ============================================
// ملف: src/routes/api.js
// الوصف: تنظيم المسارات حسب الإصدارات
// الإصدار: 2.0
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
/**
 * @swagger
 * /api:
 *   get:
 *     summary: معلومات الإصدارات
 *     tags: [🚀 API]
 *     responses:
 *       200:
 *         description: معلومات الإصدارات المتاحة
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 versions:
 *                   type: object
 *                 documentation:
 *                   type: string
 */
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
          auth: '/api/v1/auth',
          public: '/api/v1/public',
          client: '/api/v1/client',
          vendor: '/api/v1/vendor',
          driver: '/api/v1/driver',
          admin: '/api/v1/admin',
          map: '/api/v1/map',
          chat: '/api/v1/chat',
          orders: '/api/v1/orders'
        }
      }
    },
    documentation: '/api-docs'
  });
});

module.exports = router;