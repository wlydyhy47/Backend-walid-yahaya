// ============================================
// ملف: src/routes/restaurant.routes.js (النسخة النهائية)
// الوصف: مسارات المطاعم الموحدة - بدون تكرار
// ============================================

const express = require("express");
const router = express.Router();

// ✅ استيراد موحد
const { 
  restaurantController,
  reviewController,
  restaurantOwnerController  // ✅ هذا يحتوي الآن على جميع دوال العناوين
} = require('../controllers');

// الـ middlewares
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
const PaginationUtils = require('../utils/pagination.util');

// ========== 1. مسارات عامة ==========
router.get('/', auth.optional, PaginationUtils.validatePaginationParams, restaurantController.getRestaurantsPaginated);
router.get('/smart', auth.optional, restaurantController.getRestaurantsSmart);
router.get('/search', auth.optional, restaurantController.searchRestaurants);
router.get('/search/advanced', auth.optional, PaginationUtils.validatePaginationParams, restaurantController.advancedSearch);

// المسار الموحد لتفاصيل المطعم
router.get('/:id', auth.optional, restaurantController.getRestaurantCompleteDetails);
router.get('/:id/details', auth.optional, restaurantController.getRestaurantWithAddress); // للتوافق

// ========== 2. التقييمات ==========
router.get('/:id/reviews', auth.optional, reviewController.getRestaurantReviews);
router.post('/:id/reviews', auth, role('client'), reviewController.addReview);

// ========== 3. العناوين (باستخدام restaurantOwnerController) ==========
router.get('/:restaurantId/addresses', auth.optional, restaurantOwnerController.getAddresses);
router.get('/addresses/:id', auth.optional, restaurantOwnerController.getAddressById);
router.post('/addresses', auth, role('admin'), restaurantOwnerController.createAddress);
router.put('/addresses/:id', auth, role('admin'), restaurantOwnerController.updateAddress);
router.delete('/addresses/:id', auth, role('admin'), restaurantOwnerController.deleteAddress);

// ========== 4. عناصر القائمة ==========
router.get('/:id/items', auth.optional, restaurantController.getRestaurantItems);
router.post('/:id/items', auth, role('admin'), upload("items").single("image"), restaurantController.createMenuItem);
router.put('/:id/items/:itemId', auth, role('admin'), restaurantController.updateMenuItem);
router.delete('/:id/items/:itemId', auth, role('admin'), restaurantController.deleteMenuItem);

// ========== 5. مسارات الإدارة ==========
router.post("/", auth, role("admin"), restaurantController.uploadRestaurantFiles, restaurantController.createRestaurant);
router.post("/complete", auth, role("admin"), restaurantController.uploadRestaurantFiles, restaurantController.createCompleteRestaurant);
router.put("/:id", auth, role("admin"), restaurantController.updateRestaurant);
router.put("/:id/cover", auth, role("admin"), upload("restaurants").single("image"), restaurantController.updateCoverImage);
router.put("/:id/toggle-status", auth, role(["admin", "restaurant_owner"]), restaurantController.toggleRestaurantStatus);
router.delete("/:id", auth, role("admin"), restaurantController.deleteRestaurant);

// ========== 6. مسار التحديث الكامل ==========
router.put("/:id/complete", auth, role("admin"), restaurantController.uploadRestaurantFiles, restaurantController.updateCompleteRestaurant);

module.exports = router;