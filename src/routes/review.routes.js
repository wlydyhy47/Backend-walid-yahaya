const express = require("express");
const router = express.Router({ mergeParams: true });

const reviewController = require("../controllers/review.controller");
const auth = require("../middlewares/auth.middleware");

// إضافة تقييم لمطعم
router.post("/", auth, reviewController.addReview);

// جلب تقييمات مطعم
router.get("/",auth.optional, reviewController.getRestaurantReviews);

module.exports = router;
