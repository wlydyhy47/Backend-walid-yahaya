const express = require('express');
const router = express.Router();

// ✅ استيراد موحد
const { healthController } = require('../controllers');

router.get('/', healthController.quickHealthCheck);
router.get('/detailed', healthController.fullHealthCheck);
router.get('/ready', healthController.readinessProbe);
router.get('/live', healthController.livenessProbe);

module.exports = router;