// ============================================
// ملف: src/routes/address.routes.js (محدث)
// ============================================

const express = require("express");
const router = express.Router();

// ✅ استيراد موحد
const { addressController } = require('../controllers');

// الـ middlewares
const auth = require("../middlewares/auth.middleware");

// ========== جميع المسارات تحتاج توثيق ==========
router.post("/", auth, addressController.createAddress);
router.get("/me", auth, addressController.getMyAddresses);
router.delete("/:id", auth, addressController.deleteAddress);

module.exports = router;