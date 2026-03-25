// ============================================
// ملف: src/routes/analytics.routes.js
// الوصف: مسارات التحليلات والأداء الموحدة
// ============================================

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const performanceService = require('../services/performance.service');

/**
 * @swagger
 * tags:
 *   name: 📊 Analytics
 *   description: التحليلات وإحصائيات الأداء
 */

// ========== 1. مسارات عامة (لا تحتاج تسجيل) ==========

/**
 * @swagger
 * /analytics/events:
 *   post:
 *     summary: تسجيل حدث تحليلي
 *     tags: [📊 Analytics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventName
 *             properties:
 *               eventName:
 *                 type: string
 *                 enum: [page_view, button_click, order_placed, search_performed, app_launch]
 *                 example: page_view
 *               userId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               properties:
 *                 type: object
 *                 additionalProperties: true
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: تم تسجيل الحدث
 */
router.post('/events', (req, res) => {
  const { eventName, userId, sessionId, properties, timestamp } = req.body;
  
  console.log(`📊 [Analytics] Event: ${eventName}`, {
    userId,
    sessionId,
    ...properties,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    timestamp: timestamp || new Date().toISOString()
  });
  
  res.json({ success: true, message: 'Event logged' });
});

/**
 * @swagger
 * /analytics/events/batch:
 *   post:
 *     summary: تسجيل مجموعة أحداث دفعة واحدة
 *     tags: [📊 Analytics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - events
 *             properties:
 *               events:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - eventName
 *                   properties:
 *                     eventName:
 *                       type: string
 *                     properties:
 *                       type: object
 *     responses:
 *       200:
 *         description: تم تسجيل الأحداث
 */
router.post('/events/batch', (req, res) => {
  const { events = [] } = req.body;
  console.log(`📊 [Analytics] Batch: ${events.length} events`);
  events.forEach((event, index) => {
    console.log(`  ${index + 1}. ${event.eventName}`);
  });
  res.json({ success: true, count: events.length });
});

// ========== 2. مسارات محمية (للمستخدمين) ==========

/**
 * @swagger
 * /analytics/identify:
 *   post:
 *     summary: تعريف المستخدم للتتبع
 *     tags: [📊 Analytics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               traits:
 *                 type: object
 *                 description: سمات المستخدم (العمر، الموقع، إلخ)
 *               anonymousId:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم تعريف المستخدم
 */
router.post('/identify', auth, (req, res) => {
  const { traits, anonymousId } = req.body;
  const userId = req.user.id;
  console.log(`👤 [Analytics] User ${userId} identified`, { traits, anonymousId });
  res.json({ success: true });
});

// ========== 3. مسارات الأدمن فقط ==========

/**
 * @swagger
 * /analytics/performance/stats:
 *   get:
 *     summary: إحصائيات أداء API
 *     tags: [📊 Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الأداء
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
 *                     totalRequests:
 *                       type: integer
 *                     averageResponseTime:
 *                       type: number
 *                     errorRate:
 *                       type: number
 *                     requestsByEndpoint:
 *                       type: object
 *                     recent:
 *                       type: object
 */
router.get('/performance/stats', auth, role('admin'), (req, res) => {
  const stats = performanceService.getStats();
  res.json({ success: true, data: stats });
});

/**
 * @swagger
 * /analytics/performance/report:
 *   get:
 *     summary: تقرير أداء API مفصل
 *     tags: [📊 Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تقرير الأداء
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get('/performance/report', auth, role('admin'), (req, res) => {
  const report = performanceService.getReport();
  res.set('Content-Type', 'text/plain');
  res.send(report);
});

/**
 * @swagger
 * /analytics/performance/reset:
 *   post:
 *     summary: إعادة تعيين إحصائيات الأداء
 *     tags: [📊 Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تم إعادة تعيين الإحصائيات
 */
router.post('/performance/reset', auth, role('admin'), (req, res) => {
  performanceService.reset();
  res.json({ success: true, message: 'Performance stats reset successfully' });
});

/**
 * @swagger
 * /analytics/performance/requests/recent:
 *   get:
 *     summary: أحدث الطلبات المسجلة
 *     tags: [📊 Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: قائمة أحدث الطلبات
 */
router.get('/performance/requests/recent', auth, role('admin'), (req, res) => {
  const stats = performanceService.getStats();
  const limit = parseInt(req.query.limit) || 20;
  const recent = stats.recent?.requests?.slice(0, limit) || [];
  res.json({ success: true, data: recent });
});

module.exports = router;