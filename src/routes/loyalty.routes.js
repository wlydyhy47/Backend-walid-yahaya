const express = require('express');
const router = express.Router();

// ✅ استيراد موحد
const { loyaltyController } = require('../controllers');

const auth = require('../middlewares/auth.middleware');

router.get('/points', auth, loyaltyController.getPoints);
router.get('/rewards', auth, loyaltyController.getRewards);
router.get('/transactions', auth, loyaltyController.getTransactions);
router.post('/points/add', auth, loyaltyController.addPoints);
router.post('/points/redeem', auth, loyaltyController.redeemPoints);
router.get('/stats', auth, loyaltyController.getStats);

module.exports = router;