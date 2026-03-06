const express = require("express");
const router = express.Router();
const restaurantController = require("../controllers/restaurant.controller");
const auth = require("../middlewares/auth.middleware"); // ← هذا يجيب auth و auth.optional
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
const reviewRoutes = require("./review.routes");

// استيراد PaginationUtils
const PaginationUtils = require('../utils/pagination.util');

// Middleware لتحميل الصور للمطاعم (image + coverImage)
const restaurantUpload = upload("restaurants").fields([
  { name: "image", maxCount: 1 },
  { name: "coverImage", maxCount: 1 }, 
]);

// ======== PUBLIC ROUTES (لا تحتاج تسجيل دخول) ========
// ✅ هنا نستخدم auth.optional

// GET all restaurants with pagination
router.get(
  '/', 
  auth.optional,
  PaginationUtils.validatePaginationParams, 
  restaurantController.getRestaurantsPaginated
);

// ✅ المسار الذكي الجديد (QueryBuilder)
router.get(
  '/smart',
  auth.optional,
  restaurantController.getRestaurantsSmart  // 👈 دالة جديدة
);

// Advanced search with pagination
router.get(
  '/search/advanced', 
  auth.optional,
  PaginationUtils.validatePaginationParams, 
  restaurantController.advancedSearch
);

// ✅ البحث بالاسم والنوع
router.get(
  "/search", 
  auth.optional,
  restaurantController.searchRestaurants
);

// GET مطعم مع جميع العناوين
router.get(
  "/:id/details", 
  auth.optional,
  restaurantController.getRestaurantWithAddress
);

// ======== REVIEWS ROUTES (مختلط: عام + محمي) ========
router.use("/:id/reviews", reviewRoutes);

// ======== PROTECTED ROUTES (تحتاج تسجيل دخول) ========
// ✅ هنا نستخدم auth (العادي)

// POST إنشاء مطعم جديد مع رفع الصور
router.post(
  "/",
  auth,
  role("admin"),
  restaurantUpload,
  restaurantController.createRestaurant
);

// PUT تحديث صورة الغلاف
router.put(
  "/:id/cover",
  auth,
  role("admin"),
  upload("restaurants").single("image"),
  restaurantController.updateCoverImage
);

// PUT تحديث بيانات المطعم (اسم، وصف، حالة مفتوح/مغلق)
router.put(
  "/:id",
  auth,
  role("admin"),
  restaurantController.updateRestaurant
);

// DELETE حذف المطعم
router.delete(
  "/:id",
  auth,
  role("admin"),
  restaurantController.deleteRestaurant
);

module.exports = router;