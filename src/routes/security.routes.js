const express = require('express');
const router = express.Router();

// ✅ استيراد موحد
const { securityController } = require('../controllers');

const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const rateLimiter = require('../middlewares/rateLimit.middleware');

router.post('/check-password', rateLimiter.apiLimiter, securityController.checkPassword);
router.post('/check-email', rateLimiter.apiLimiter, securityController.checkEmail);
router.get('/headers', auth, role('admin'), securityController.getSecurityHeaders);

module.exports = router;