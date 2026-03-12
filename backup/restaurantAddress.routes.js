const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const restaurantAddressController = require("../controllers/restaurantAddress.controller");

// إنشاء عنوان للمطعم (Admin)
router.post("/", auth, role("admin"), restaurantAddressController.createAddress);

// جلب عناوين مطعم معين
router.get("/:restaurantId", restaurantAddressController.getAddresses);

module.exports = router;
