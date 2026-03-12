const express = require('express');
const router = express.Router();

// ✅ استيراد موحد
const { assetsController } = require('../controllers');

router.get('/images', assetsController.getImages);
router.get('/icons', assetsController.getIcons);
router.get('/defaults', assetsController.getDefaultImages);

module.exports = router;