// ============================================
// ملف: src/routes/loyalty.routes.js (المُصلح)
// ============================================

const express = require('express');
const router = express.Router();

// ✅ استيراد موحد
const { loyaltyController } = require('../controllers');

const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware'); // ✅ إضافة role middleware

// ========== مسارات المستخدم العادي ==========
router.get('/points', auth, loyaltyController.getPoints);
router.get('/rewards', auth, loyaltyController.getRewards);
router.get('/transactions', auth, loyaltyController.getTransactions);
router.post('/points/redeem', auth, loyaltyController.redeemPoints);
router.get('/stats', auth, loyaltyController.getStats);

// ✅ ✅ ✅ تم تعديل هذا المسار ليكون محمي بـ Admin فقط ✅ ✅ ✅
router.post('/points/add', auth, role('admin'), loyaltyController.addPoints);

module.exports = router;