// ============================================
// ملف: src/routes/restaurant.routes.js (نسخة نهائية)
// الوصف: مسارات المطاعم الموحدة - بدون تكرار
// ============================================

const express = require("express");
const router = express.Router();

// ✅ استيراد موحد
const { 
  restaurantController,
  restaurantAddressController,
  reviewController,
  aggregateController 
} = require('../controllers');

// الـ middlewares
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
const PaginationUtils = require('../utils/pagination.util');

const restaurantUpload = upload("restaurants").fields([
  { name: "image", maxCount: 1 },
  { name: "coverImage", maxCount: 1 },
  { name: "itemImages", maxCount: 20 }
]);

// ========== 1. مسارات عامة ==========
router.get('/', auth.optional, PaginationUtils.validatePaginationParams, restaurantController.getRestaurantsPaginated);
router.get('/smart', auth.optional, restaurantController.getRestaurantsSmart);
router.get('/search', auth.optional, restaurantController.searchRestaurants);
router.get('/search/advanced', auth.optional, PaginationUtils.validatePaginationParams, restaurantController.advancedSearch);

// ✅ المسار الموحد لتفاصيل المطعم (يجمع details و full في مسار واحد)
router.get('/:id', auth.optional, restaurantController.getRestaurantCompleteDetails);

// ========== 2. التقييمات ==========
router.get('/:id/reviews', auth.optional, reviewController.getRestaurantReviews);
router.post('/:id/reviews', auth, role('client'), reviewController.addReview);

// ========== 3. العناوين ==========
router.get('/:restaurantId/addresses', auth.optional, restaurantAddressController.getAddresses);
router.post('/addresses', auth, role('admin'), restaurantAddressController.createAddress);
router.put('/addresses/:id', auth, role('admin'), restaurantAddressController.updateAddress);
router.delete('/addresses/:id', auth, role('admin'), restaurantAddressController.deleteAddress);

// ========== 4. مسارات الإدارة ==========
router.post("/", auth, role("admin"), restaurantUpload, restaurantController.createRestaurant);
router.post("/complete", auth, role("admin"), restaurantUpload, restaurantController.createCompleteRestaurant);
router.put("/:id", auth, role("admin"), restaurantController.updateRestaurant);
router.put("/:id/cover", auth, role("admin"), upload("restaurants").single("image"), restaurantController.updateCoverImage);
router.put("/:id/toggle-status", auth, role("admin"), restaurantController.toggleRestaurantStatus);
router.delete("/:id", auth, role("admin"), restaurantController.deleteRestaurant);

// ========== 5. عناصر القائمة ==========
router.get('/:id/items', auth.optional, restaurantController.getRestaurantItems);
router.post('/:id/items', auth, role('admin'), upload("items").single("image"), restaurantController.createMenuItem);
router.put('/:id/items/:itemId', auth, role('admin'), restaurantController.updateMenuItem);
router.delete('/:id/items/:itemId', auth, role('admin'), restaurantController.deleteMenuItem);

module.exports = router;