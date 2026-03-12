// ============================================
// ملف: src/routes/user.routes.js
// الوصف: مسارات المستخدمين - نسخة محدثة
// ============================================

const express = require("express");
const router = express.Router();

// ✅ الخطوة 1: استيراد موحد للـ Controllers
const { 
  userController, 
  userCompleteController, 
  favoriteController 
} = require('../controllers');

// ✅ الخطوة 2: استيراد الـ middlewares (كما هي)
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
const PaginationUtils = require('../utils/pagination.util');

// ========== 1. مسارات المسؤول (تبقى كما هي) ==========
router.get("/", auth, role("admin"), PaginationUtils.validatePaginationParams, userController.getUsers);
router.get("/:id", auth, role("admin"), userController.getUser);
router.post("/", auth, role("admin"), userController.createUser);
router.put("/:id", auth, role("admin"), userController.updateUser);
router.delete("/:id", auth, role("admin"), userController.deleteUser);

// ========== 2. مسارات المستخدم الحالي (تبقى كما هي) ==========
router.get("/me", auth, userController.getMyProfile);
router.get("/me/complete", auth, userCompleteController.getMyCompleteProfile);
router.put("/me", auth, userController.updateMyProfile);
router.put("/me/complete", auth, userCompleteController.updateCompleteProfile);

// الصور
router.put("/me/avatar", auth, upload("users/avatars").single("image"), userController.uploadAvatar);
router.put("/me/cover", auth, upload("users/covers").single("image"), userCompleteController.updateCoverImage);
router.delete("/me/avatar", auth, userController.deleteAvatar);

// الأمان
router.put("/me/password", auth, userCompleteController.changePassword);

// ========== 3. المفضلة (تبقى كما هي) ==========
router.get("/me/favorites", auth, favoriteController.getUserFavorites);
router.post("/me/favorites/:restaurantId", auth, favoriteController.addToFavorites);
router.delete("/me/favorites/:restaurantId", auth, favoriteController.removeFromFavorites);
router.get("/me/favorites/:restaurantId/status", auth, favoriteController.checkFavoriteStatus);
router.put("/me/favorites/:restaurantId", auth, favoriteController.updateFavorite);

// ========== 4. الإحصائيات (تبقى كما هي) ==========
router.get("/me/stats", auth, userCompleteController.getUserStats);
router.get("/me/activity", auth, PaginationUtils.validatePaginationParams, userCompleteController.getActivityLog);
router.put("/me/presence", auth, userCompleteController.updatePresence);

module.exports = router;