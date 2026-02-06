const express = require('express');
const router = express.Router();
const healthCheckService = require('../services/healthCheck.service');

// Health check سريع
router.get('/', async (req, res) => {
  try {
    const health = await healthCheckService.quickHealthCheck();
    
    res.status(health.status === 'ok' ? 200 : 503).json({
      success: health.status === 'ok',
      ...health
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Health check مفصل
router.get('/detailed', async (req, res) => {
  try {
    const health = await healthCheckService.fullHealthCheck();
    
    res.status(health.status === 'healthy' ? 200 : 
               health.status === 'warning' ? 200 : 503).json({
      success: health.status !== 'unhealthy',
      ...health
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'error',
      message: 'Detailed health check failed',
      error: error.message
    });
  }
});

// Health check للمراقبة (Prometheus format)
router.get('/metrics', async (req, res) => {
  try {
    const health = await healthCheckService.fullHealthCheck();
    
    const metrics = [
      '# HELP app_health Application health status',
      '# TYPE app_health gauge',
      `app_health{status="${health.status}"} ${health.status === 'healthy' ? 1 : health.status === 'warning' ? 0.5 : 0}`,
      
      '# HELP app_uptime Application uptime in seconds',
      '# TYPE app_uptime gauge',
      `app_uptime ${health.uptime}`,
      
      '# HELP app_checks_total Total health checks',
      '# TYPE app_checks_total gauge',
      `app_checks_total ${health.checks.length}`,
      
      '# HELP app_checks_healthy Healthy health checks',
      '# TYPE app_checks_healthy gauge',
      `app_checks_healthy ${health.checks.filter(c => c.status === 'healthy').length}`
    ];

    res.set('Content-Type', 'text/plain');
    res.send(metrics.join('\n'));
  } catch (error) {
    res.status(503).send(`# ERROR: ${error.message}`);
  }
});

// Readiness probe (لـ Kubernetes/Docker)
router.get('/ready', async (req, res) => {
  try {
    const health = await healthCheckService.quickHealthCheck();
    
    if (health.status === 'ok') {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready' });
    }
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});

// Liveness probe
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

module.exports = router;