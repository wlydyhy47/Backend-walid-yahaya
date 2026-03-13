// ============================================
// ملف: src/routes/user.routes.js
// الوصف: مسارات المستخدمين - نسخة محدثة
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
router.get("/", auth, role("admin"), PaginationUtils.validatePaginationParams, userController.getUsers);
router.get("/:id", auth, role("admin"), userController.getUserById);
router.post("/", auth, role("admin"), userController.createUser);
router.put("/:id", auth, role("admin"), userController.updateUserById);
router.delete("/:id", auth, role("admin"), userController.deleteUserById);

// ========== 2. مسارات المستخدم الحالي ==========
router.get("/me", auth, userController.getMyProfile);
router.get("/me/complete", auth, userController.getMyCompleteProfile);
router.put("/me", auth, userController.updateMyProfile);
router.put("/me/complete", auth, userController.updateCompleteProfile);

// الصور
router.put("/me/avatar", auth, upload("users/avatars").single("image"), userController.uploadAvatar);
router.put("/me/cover", auth, upload("users/covers").single("image"), userController.updateCoverImage);
router.delete("/me/avatar", auth, userController.deleteAvatar);

// الأمان
router.put("/me/password", auth, userController.changePassword);

// ========== 3. المفضلة ==========
router.get("/me/favorites", auth, userController.getMyFavorites);
router.post("/me/favorites/:restaurantId", auth, userController.addToFavorites);
router.delete("/me/favorites/:restaurantId", auth, userController.removeFromFavorites);
router.get("/me/favorites/:restaurantId/status", auth, userController.checkFavoriteStatus);
router.put("/me/favorites/:restaurantId", auth, userController.updateFavorite);

// ========== 4. الإحصائيات ==========
router.get("/me/stats", auth, userController.getUserStats);
router.get("/me/activity", auth, PaginationUtils.validatePaginationParams, userController.getActivityLog);
router.put("/me/presence", auth, userController.updatePresence);

module.exports = router;