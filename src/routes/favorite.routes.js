// /opt/render/project/src/src/routes/favorite.routes.js
const express = require("express");
const router = express.Router({ mergeParams: true });
const auth = require("../middlewares/auth.middleware");
const favoriteController = require("../controllers/favorite.controller");

// جميع الرواتب تحتاج مصادقة
router.use(auth);

// GET مفضلات المستخدم
router.get("/", favoriteController.getUserFavorites);

// POST إضافة للمفضلة
router.post("/:restaurantId", favoriteController.addToFavorites);

// DELETE إزالة من المفضلة
router.delete("/:restaurantId", favoriteController.removeFromFavorites);

// GET التحقق من حالة المفضلة
router.get("/:restaurantId/status", favoriteController.checkFavoriteStatus);

// PUT تحديث ملاحظات/تاجات
router.put("/:restaurantId", favoriteController.updateFavorite);

module.exports = router;