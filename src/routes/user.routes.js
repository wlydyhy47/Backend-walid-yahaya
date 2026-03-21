// ============================================
// ملف: src/routes/user.routes.js (المُصلح - تم إزالة الازدواجية)
// الوصف: مسارات المستخدمين - فقط مسارات الأدمن
// الإصدار: 5.0
// ============================================

const express = require("express");
const router = express.Router();

// ✅ استيراد موحد للـ Controllers
const { 
  userController 
} = require('../controllers');

// ✅ الـ middlewares
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
const PaginationUtils = require('../utils/pagination.util');

// ========== 1. مسارات المسؤول فقط ==========
/**
 * @route   GET /api/v1/admin/users
 * @desc    الحصول على جميع المستخدمين
 * @access  Admin
 */
router.get("/admin/users", auth, role("admin"), PaginationUtils.validatePaginationParams, userController.getUsers);

/**
 * @route   GET /api/v1/admin/users/:id
 * @desc    الحصول على مستخدم محدد
 * @access  Admin
 */
router.get("/admin/users/:id", auth, role("admin"), userController.getUserById);

/**
 * @route   POST /api/v1/admin/users
 * @desc    إنشاء مستخدم جديد
 * @access  Admin
 */
router.post("/admin/users", auth, role("admin"), userController.createUser);

/**
 * @route   PUT /api/v1/admin/users/:id
 * @desc    تحديث مستخدم
 * @access  Admin
 */
router.put("/admin/users/:id", auth, role("admin"), userController.updateUserById);

/**
 * @route   DELETE /api/v1/admin/users/:id
 * @desc    حذف/تعطيل مستخدم
 * @access  Admin
 */
router.delete("/admin/users/:id", auth, role("admin"), userController.deleteUserById);

// ========== ملاحظة: مسارات المستخدم الشخصي (profile, favorites, etc) ==========
// تم نقلها بالكامل إلى client.routes.js لتجنب الازدواجية
// الرجاء استخدام client.routes.js للمسارات التالية:
// - /client/profile
// - /client/favorites
// - /client/stats
// - /client/activity
// - /client/presence

module.exports = router;