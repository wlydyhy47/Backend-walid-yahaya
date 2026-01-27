const RestaurantAddress = require("../models/restaurantAddress.model");
const Restaurant = require("../models/restaurant.model");

// ➕ إنشاء عنوان مطعم
exports.createAddress = async (req, res) => {
  try {
    const { restaurantId, addressLine, city, latitude, longitude } = req.body;

    // تحقق أن المطعم موجود
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const address = await RestaurantAddress.create({
      restaurant: restaurantId,
      addressLine,
      city,
      latitude,
      longitude,
    });

    res.status(201).json(address);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create restaurant address" });
  }
};

// 📍 جلب عنوان المطعم
exports.getAddresses = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const addresses = await RestaurantAddress.find({
      restaurant: restaurantId,
    });

    res.json(addresses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch restaurant addresses" });
  }
};
