// ============================================
// ملف: src/routes/user.routes.js (مصحح)
// الوصف: مسارات المستخدمين
// الإصدار: 4.0
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

// ========== 1. مسارات المسؤول ==========
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

// ========== 2. مسارات المستخدم الحالي ==========
/**
 * @route   GET /api/v1/client/profile
 * @desc    الملف الشخصي للمستخدم
 * @access  Authenticated
 */
router.get("/client/profile", auth, userController.getMyProfile);

/**
 * @route   GET /api/v1/client/profile/complete
 * @desc    الملف الشخصي الكامل
 * @access  Authenticated
 */
router.get("/client/profile/complete", auth, userController.getMyCompleteProfile);

/**
 * @route   PUT /api/v1/client/profile
 * @desc    تحديث الملف الشخصي
 * @access  Authenticated
 */
router.put("/client/profile", auth, userController.updateMyProfile);

/**
 * @route   PUT /api/v1/client/profile/complete
 * @desc    تحديث الملف الشخصي الكامل
 * @access  Authenticated
 */
router.put("/client/profile/complete", auth, userController.updateCompleteProfile);

// ========== 3. الصور ==========
/**
 * @route   PUT /api/v1/client/profile/avatar
 * @desc    رفع الصورة الشخصية
 * @access  Authenticated
 */
router.put("/client/profile/avatar", auth, upload("users/avatars").single("image"), userController.uploadAvatar);

/**
 * @route   PUT /api/v1/client/profile/cover
 * @desc    تحديث صورة الغلاف
 * @access  Authenticated
 */
router.put("/client/profile/cover", auth, upload("users/covers").single("image"), userController.updateCoverImage);

/**
 * @route   DELETE /api/v1/client/profile/avatar
 * @desc    حذف الصورة الشخصية
 * @access  Authenticated
 */
router.delete("/client/profile/avatar", auth, userController.deleteAvatar);

// ========== 4. الأمان ==========
/**
 * @route   PUT /api/v1/client/profile/password
 * @desc    تغيير كلمة المرور
 * @access  Authenticated
 */
router.put("/client/profile/password", auth, userController.changePassword);

// ========== 5. المفضلة ==========
/**
 * @route   GET /api/v1/client/favorites
 * @desc    الحصول على المفضلة
 * @access  Authenticated
 */
router.get("/client/favorites", auth, userController.getMyFavorites);

/**
 * @route   POST /api/v1/client/favorites/:storeId
 * @desc    إضافة للمفضلة
 * @access  Authenticated
 */
router.post("/client/favorites/:storeId", auth, userController.addToFavorites);

/**
 * @route   DELETE /api/v1/client/favorites/:storeId
 * @desc    إزالة من المفضلة
 * @access  Authenticated
 */
router.delete("/client/favorites/:storeId", auth, userController.removeFromFavorites);

/**
 * @route   GET /api/v1/client/favorites/:storeId/status
 * @desc    التحقق من حالة المفضلة
 * @access  Authenticated
 */
router.get("/client/favorites/:storeId/status", auth, userController.checkFavoriteStatus);

/**
 * @route   PUT /api/v1/client/favorites/:storeId
 * @desc    تحديث المفضلة
 * @access  Authenticated
 */
router.put("/client/favorites/:storeId", auth, userController.updateFavorite);

// ========== 6. الإحصائيات ==========
/**
 * @route   GET /api/v1/client/stats
 * @desc    إحصائيات المستخدم
 * @access  Authenticated
 */
router.get("/client/stats", auth, userController.getUserStats);

/**
 * @route   GET /api/v1/client/activity
 * @desc    سجل النشاطات
 * @access  Authenticated
 */
router.get("/client/activity", auth, PaginationUtils.validatePaginationParams, userController.getActivityLog);

/**
 * @route   PUT /api/v1/client/presence
 * @desc    تحديث حالة التواجد
 * @access  Authenticated
 */
router.put("/client/presence", auth, userController.updatePresence);

module.exports = router;