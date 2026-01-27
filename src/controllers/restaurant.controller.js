const Restaurant = require("../models/restaurant.model");
const RestaurantAddress = require("../models/restaurantAddress.model");

/**
 * GET all restaurants
 */
exports.getRestaurants = async (req, res) => {
  try {
    const restaurants = await Restaurant.find()
      .populate("createdBy", "name phone email")
      .populate("items");

    res.json(restaurants);
  } catch {
    res.status(500).json({ message: "Failed to fetch restaurants" });
  }
};

/**
 * Search restaurants
 */
exports.searchRestaurants = async (req, res) => {
  try {
    const { name, type } = req.query;
    const filter = {};

    if (name) filter.name = { $regex: name, $options: "i" };
    if (type) filter.type = type;

    const restaurants = await Restaurant.find(filter)
      .populate("createdBy", "name phone")
      .populate("items");

    res.json(restaurants);
  } catch {
    res.status(500).json({ message: "Search failed" });
  }
};

/**
 * Get restaurant with addresses
 */
exports.getRestaurantWithAddress = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id)
      .populate("createdBy", "name email phone")
      .lean();

    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });

    const addresses = await RestaurantAddress.find({
      restaurant: req.params.id,
    });

    res.json({ ...restaurant, addresses });
  } catch {
    res.status(500).json({ message: "Failed to fetch restaurant info" });
  }
};

/**
 * Create restaurant
 */
exports.createRestaurant = async (req, res) => {
  try {
    const { name, description, type } = req.body;

    const restaurant = await Restaurant.create({
      name,
      description,
      type: type || "restaurant",
      image: req.files?.image ? req.files.image[0].path : null,
      coverImage: req.files?.coverImage ? req.files.coverImage[0].path : null,
      createdBy: req.user.id,
      isOpen: true,
    });

    await restaurant.populate("createdBy", "name email phone");
    res.status(201).json(restaurant);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create restaurant" });
  }
};

/**
 * Update restaurant data
 */
exports.updateRestaurant = async (req, res) => {
  try {
    const { name, description, type, isOpen } = req.body;

    const restaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      { name, description, type, isOpen },
      { new: true }
    );

    res.json(restaurant);
  } catch {
    res.status(500).json({ message: "Failed to update restaurant" });
  }
};

/**
 * Update cover image
 */
exports.updateCoverImage = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "No image uploaded" });

    const restaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      { coverImage: req.file.path },
      { new: true }
    );

    res.json(restaurant);
  } catch {
    res.status(500).json({ message: "Failed to update cover image" });
  }
};

/**
 * Delete restaurant
 */
exports.deleteRestaurant = async (req, res) => {
  try {
    await Restaurant.findByIdAndDelete(req.params.id);
    res.json({ message: "Restaurant deleted" });
  } catch {
    res.status(500).json({ message: "Failed to delete restaurant" });
  }
};
