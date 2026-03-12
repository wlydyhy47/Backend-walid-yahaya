// ============================================
// ملف: src/routes/analytics.routes.js (المُحدث)
// الوصف: مسارات التحليلات والأداء الموحدة
// ============================================

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const performanceService = require('../services/performance.service');

// ========== 1. مسارات عامة (لا تحتاج تسجيل) ==========

// تسجيل حدث
router.post('/events', (req, res) => {
  const { eventName, ...data } = req.body;
  
  console.log(`📊 [Analytics] Event: ${eventName}`, {
    ...data,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  res.json({ success: true });
});

// أحداث متعددة
router.post('/events/batch', (req, res) => {
  const { events = [] } = req.body;
  console.log(`📊 [Analytics] Batch: ${events.length} events`);
  res.json({ success: true, count: events.length });
});

// ========== 2. مسارات محمية (للمستخدمين) ==========

// تعريف المستخدم
router.post('/identify', auth, (req, res) => {
  const { userId = req.user.id, ...properties } = req.body;
  console.log(`👤 [Analytics] User ${userId} identified`);
  res.json({ success: true });
});

// ========== 3. مسارات الأدمن فقط (دمج performance) ==========

// إحصائيات الأداء
router.get('/performance/stats', auth, role('admin'), (req, res) => {
  const stats = performanceService.getStats();
  res.json({ success: true, data: stats });
});

// تقرير الأداء
router.get('/performance/report', auth, role('admin'), (req, res) => {
  const report = performanceService.getReport();
  res.set('Content-Type', 'text/plain');
  res.send(report);
});

// آخر الطلبات
router.get('/performance/requests/recent', auth, role('admin'), (req, res) => {
  const stats = performanceService.getStats();
  res.json({ success: true, data: stats.recent.requests });
});

// إعادة تعيين الإحصائيات
router.post('/performance/reset', auth, role('admin'), (req, res) => {
  performanceService.reset();
  res.json({ success: true, message: 'Performance stats reset' });
});

module.exports = router;