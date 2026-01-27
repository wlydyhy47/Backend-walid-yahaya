const Review = require("../models/review.model");
const Restaurant = require("../models/restaurant.model");


// POST /api/restaurants/:id/reviews

exports.addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const restaurantId = req.params.id;

    const review = await Review.create({
      user: req.user.id,
      restaurant: restaurantId,
      rating,
      comment,
    });

    // 🔄 حساب المتوسط وعدد التقييمات
    const stats = await Review.aggregate([
      { $match: { restaurant: review.restaurant } },
      {
        $group: {
          _id: "$restaurant",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);

    await Restaurant.findByIdAndUpdate(restaurantId, {
      averageRating: stats[0].avgRating,
      ratingsCount: stats[0].count,
    });

    res.status(201).json(review);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ message: "You already rated this restaurant" });
    }

    console.error(error);
    res.status(500).json({ message: "Failed to add review" });
  }
};

// GET  /api/restaurants/:id/reviews

exports.getRestaurantReviews = async (req, res) => {
  try {
    const restaurantId = req.params.id;

    const reviews = await Review.find({ restaurant: restaurantId })
      .populate("user", "name")
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
};
