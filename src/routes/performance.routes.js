// src/routes/performance.routes.js

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const performanceService = require('../services/performance.service');

/**
 * @route   GET /api/performance/stats
 * @desc    إحصائيات الأداء المفصلة
 * @access  Admin
 */
router.get('/stats', auth, role('admin'), (req, res) => {
  try {
    const stats = performanceService.getStats();
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error getting performance stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get performance stats'
    });
  }
});

/**
 * @route   GET /api/performance/report
 * @desc    تقرير الأداء (نصي)
 * @access  Admin
 */
router.get('/report', auth, role('admin'), (req, res) => {
  try {
    const report = performanceService.getReport();
    
    res.set('Content-Type', 'text/plain');
    res.send(report);
  } catch (error) {
    console.error('Error getting performance report:', error);
    res.status(500).send('Failed to get performance report');
  }
});

/**
 * @route   GET /api/performance/health
 * @desc    فحص صحة النظام
 * @access  Admin
 */
router.get('/health', auth, role('admin'), (req, res) => {
  try {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    
    res.json({
      success: true,
      data: {
        memory: {
          rss: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`,
          heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
          heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          external: `${(memory.external / 1024 / 1024).toFixed(2)} MB`
        },
        cpu: {
          user: `${(cpu.user / 1000000).toFixed(2)} seconds`,
          system: `${(cpu.system / 1000000).toFixed(2)} seconds`
        },
        uptime: `${(process.uptime() / 60).toFixed(2)} minutes`,
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch
      }
    });
  } catch (error) {
    console.error('Error getting health stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get health stats'
    });
  }
});

/**
 * @route   POST /api/performance/reset
 * @desc    إعادة تعيين إحصائيات الأداء
 * @access  Admin
 */
router.post('/reset', auth, role('admin'), (req, res) => {
  try {
    performanceService.reset();
    
    res.json({
      success: true,
      message: 'Performance metrics reset successfully'
    });
  } catch (error) {
    console.error('Error resetting performance stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset performance stats'
    });
  }
});

/**
 * @route   GET /api/performance/requests/recent
 * @desc    آخر 20 طلب
 * @access  Admin
 */
router.get('/requests/recent', auth, role('admin'), (req, res) => {
  try {
    const stats = performanceService.getStats();
    
    res.json({
      success: true,
      data: stats.recent.requests,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error getting recent requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recent requests'
    });
  }
});

module.exports = router;