// ============================================
// ملف: src/routes/health.routes.js
// الوصف: مسارات فحص صحة النظام
// الإصدار: 2.0
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
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 uptimeHuman:
 *                   type: string
 *                 version:
 *                   type: string
 *                 environment:
 *                   type: string
 *                 database:
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
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 responseTime:
 *                   type: string
 *                 uptime:
 *                   type: number
 *                 uptimeHuman:
 *                   type: string
 *                 version:
 *                   type: string
 *                 environment:
 *                   type: string
 *                 nodeVersion:
 *                   type: string
 *                 platform:
 *                   type: string
 *                 memory:
 *                   type: object
 *                 cpu:
 *                   type: object
 *                 checks:
 *                   type: array
 *                 recommendations:
 *                   type: array
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ready:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alive:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 *                 uptime:
 *                   type: number
 *       503:
 *         description: النظام غير مستقر
 */
router.get('/live', healthController.livenessProbe);

module.exports = router;