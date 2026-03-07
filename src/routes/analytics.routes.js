// src/routes/analytics.routes.js
const express = require('express');
const router = express.Router();

// ========== مسارات التحليلات المؤقتة ==========

/**
 * @route POST /api/analytics/events
 * @desc تسجيل حدث تحليلي
 */
router.post('/events', (req, res) => {
  console.log('📊 [Analytics] Event received:', {
    ...req.body,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString()
  });
  
  res.json({
    success: true,
    message: 'Event recorded successfully',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route POST /api/analytics/events/batch
 * @desc تسجيل أحداث متعددة
 */
router.post('/events/batch', (req, res) => {
  const { events = [] } = req.body;
  
  console.log(`📊 [Analytics] Batch events received: ${events.length} events`);
  
  events.forEach((event, index) => {
    console.log(`  ${index + 1}. ${event.eventName || 'unknown'}`);
  });
  
  res.json({
    success: true,
    message: `${events.length} events recorded successfully`,
    timestamp: new Date().toISOString()
  });
});

/**
 * @route POST /api/analytics/identify
 * @desc تعريف المستخدم
 */
router.post('/identify', (req, res) => {
  const { userId, ...properties } = req.body;
  
  console.log(`👤 [Analytics] User identified: ${userId}`, properties);
  
  res.json({
    success: true,
    message: 'User identified successfully',
    userId,
    timestamp: new Date().toISOString()
  });
});

/**
 * @route POST /api/analytics/pageview
 * @desc تسجيل مشاهدة صفحة
 */
router.post('/pageview', (req, res) => {
  const { page, referrer, ...details } = req.body;
  
  console.log(`📄 [Analytics] Page view: ${page}`, {
    referrer,
    ...details,
    ip: req.ip
  });
  
  res.json({
    success: true,
    message: 'Page view recorded',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route POST /api/analytics/conversion
 * @desc تسجيل تحويل
 */
router.post('/conversion', (req, res) => {
  const { type, value, ...details } = req.body;
  
  console.log(`💰 [Analytics] Conversion: ${type} = ${value}`, details);
  
  res.json({
    success: true,
    message: 'Conversion recorded',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route POST /api/analytics/error
 * @desc تسجيل خطأ
 */
router.post('/error', (req, res) => {
  const { errorType, message, ...details } = req.body;
  
  console.error(`❌ [Analytics] Error: ${errorType}`, {
    message,
    ...details,
    ip: req.ip
  });
  
  res.json({
    success: true,
    message: 'Error recorded',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;