const express = require("express");
const router = express.Router();
const restaurantCompleteController = require("../controllers/restaurantComplete.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

/**
 * 🚀 إنشاء مطعم كامل (جميع البيانات في request واحد)
 * POST /api/restaurants/complete
 * 
 * Content-Type: multipart/form-data
 * 
 * يحتوي على:
 * 1. بيانات المطعم الأساسية (نصية)
 * 2. صور المطعم (ملفات)
 * 3. عناوين المطعم (JSON)
 * 4. عناصر القائمة (JSON + صور)
 * 5. ساعات العمل (JSON)
 */
router.post(
  "/complete",
  auth,
  role("admin"),
  restaurantCompleteController.uploadRestaurantFiles,
  restaurantCompleteController.createCompleteRestaurant
);

/**
 * 🔄 تحديث مطعم كامل
 * PUT /api/restaurants/:id/complete
 */
router.put(
  "/:id/complete",
  auth,
  role("admin"),
  restaurantCompleteController.uploadRestaurantFiles,
  restaurantCompleteController.updateCompleteRestaurant
);

module.exports = router;