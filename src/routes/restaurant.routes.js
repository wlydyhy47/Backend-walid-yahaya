const express = require("express");
const router = express.Router();
const restaurantController = require("../controllers/restaurant.controller");
const auth = require("../middlewares/auth.middleware");
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

// ======== ROUTES ========

// GET all restaurants with pagination
router.get('/', PaginationUtils.validatePaginationParams, restaurantController.getRestaurantsPaginated);

// Advanced search with pagination
router.get('/search/advanced', PaginationUtils.validatePaginationParams, restaurantController.advancedSearch);

// ✅ البحث بالاسم والنوع
router.get("/search", restaurantController.searchRestaurants);

// GET مطعم مع جميع العناوين
router.get("/:id/details", restaurantController.getRestaurantWithAddress);

// POST إنشاء مطعم جديد مع رفع الصور
router.post(
  "/",
  auth,
  role("admin"),
  restaurantUpload,
  restaurantController.createRestaurant
);

// ======== Reviews ========
router.use("/:id/reviews", reviewRoutes);

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