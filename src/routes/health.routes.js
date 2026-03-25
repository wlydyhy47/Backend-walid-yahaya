// ============================================
// ملف: src/routes/health.routes.js
// الوصف: مسارات فحص صحة النظام
// ============================================

const express = require('express');
const router = express.Router();

const { healthController } = require('../controllers');

/**
 * @swagger
 * tags:
 *   name: 🏥 Health
 *   description: فحص صحة النظام وحالته
 */

/**
 * @swagger
 * /health:
 *   get:
 *     summary: فحص صحة النظام (سريع)
 *     tags: [🏥 Health]
 *     responses:
 *       200:
 *         description: النظام يعمل بشكل طبيعي
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 version:
 *                   type: string
 */
router.get('/', healthController.quickHealthCheck);

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     summary: فحص صحة النظام (تفصيلي)
 *     tags: [🏥 Health]
 *     responses:
 *       200:
 *         description: تفاصيل حالة النظام
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                     uptime:
 *                       type: number
 *                     memory:
 *                       type: object
 *                     database:
 *                       type: object
 *                     redis:
 *                       type: object
 *                     services:
 *                       type: object
 *                     timestamp:
 *                       type: string
 */
router.get('/detailed', healthController.fullHealthCheck);

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: فحص جاهزية النظام (Readiness Probe)
 *     tags: [🏥 Health]
 *     description: يستخدم في Kubernetes لفحص جاهزية التطبيق لاستقبال الطلبات
 *     responses:
 *       200:
 *         description: النظام جاهز
 *       503:
 *         description: النظام غير جاهز
 */
router.get('/ready', healthController.readinessProbe);

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: فحص حيوية النظام (Liveness Probe)
 *     tags: [🏥 Health]
 *     description: يستخدم في Kubernetes لفحص ما إذا كان التطبيق يعمل
 *     responses:
 *       200:
 *         description: النظام يعمل
 *       503:
 *         description: النظام غير مستقر
 */
router.get('/live', healthController.livenessProbe);

module.exports = router;