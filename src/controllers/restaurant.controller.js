const Restaurant = require("../models/restaurant.model");
const RestaurantAddress = require("../models/restaurantAddress.model");
const Favorite = require("../models/favorite.model"); // ← أضف هذا
const PaginationUtils = require('../utils/pagination.util');

/**
 * GET all restaurants
 */
exports.getRestaurants = async (req, res) => {
  try {
    const restaurants = await Restaurant.find()
      .populate("createdBy", "name phone email")
      .populate("items");

    // ✅ إضافة isFavorite للمستخدم المسجل
    let restaurantsWithFavorites = restaurants;
    
    if (req.user) {
      const favorites = await Favorite.find({ userId: req.user.id });
      const favoriteIds = favorites.map(f => f.restaurantId.toString());
      
      restaurantsWithFavorites = restaurants.map(restaurant => {
        const rest = restaurant.toObject();
        rest.isFavorite = favoriteIds.includes(rest._id.toString());
        return rest;
      });
    }

    res.json(restaurantsWithFavorites);
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

    // ✅ إضافة isFavorite للمستخدم المسجل
    let restaurantsWithFavorites = restaurants;
    
    if (req.user) {
      const favorites = await Favorite.find({ userId: req.user.id });
      const favoriteIds = favorites.map(f => f.restaurantId.toString());
      
      restaurantsWithFavorites = restaurants.map(restaurant => {
        const rest = restaurant.toObject();
        rest.isFavorite = favoriteIds.includes(rest._id.toString());
        return rest;
      });
    }

    res.json(restaurantsWithFavorites);
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

    // ✅ إضافة isFavorite للمستخدم المسجل
    let restaurantWithDetails = { ...restaurant, addresses };
    
    if (req.user) {
      const favorite = await Favorite.findOne({
        userId: req.user.id,
        restaurantId: restaurant._id
      });
      restaurantWithDetails.isFavorite = !!favorite;
    } else {
      restaurantWithDetails.isFavorite = false;
    }

    res.json(restaurantWithDetails);
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
      createdBy: req.user.id, // ✅ هنا req.user موجود لأن auth إلزامي
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

/**
 * 📋 الحصول على المطاعم مع Pagination
 * GET /api/restaurants
 */
exports.getRestaurantsPaginated = async (req, res) => {
  try {
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, search, filters } = paginationOptions;
    
    let query = { isOpen: true };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    
    if (filters.type) {
      query.type = filters.type;
    }
    
    const [restaurants, total] = await Promise.all([
      Restaurant.find(query)
        .populate('createdBy', 'name phone email')
        .populate('items')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      
      Restaurant.countDocuments(query),
    ]);

    // ✅ إضافة isFavorite للمستخدم المسجل
    let restaurantsWithFavorites = restaurants;
    
    if (req.user) {
      const favorites = await Favorite.find({ userId: req.user.id });
      const favoriteIds = favorites.map(f => f.restaurantId.toString());
      
      restaurantsWithFavorites = restaurants.map(restaurant => {
        const rest = restaurant.toObject();
        rest.isFavorite = favoriteIds.includes(rest._id.toString());
        return rest;
      });
    }

    const response = PaginationUtils.createPaginationResponse(
      restaurantsWithFavorites,
      total,
      paginationOptions
    );
    
    res.json(response);
  } catch (error) {
    console.error('Pagination error:', error);
    res.status(500).json({ message: 'Failed to fetch restaurants' });
  }
};

/**
 * 🔍 بحث متقدم مع Pagination
 * GET /api/restaurants/search/advanced
 */
exports.advancedSearch = async (req, res) => {
  try {
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;
    
    // بناء استعلام متقدم
    let query = { isOpen: true };
    
    if (filters.name) {
      query.name = { $regex: filters.name, $options: 'i' };
    }
    
    if (filters.type) {
      query.type = filters.type;
    }
    
    if (filters.minRating) {
      query.averageRating = { $gte: Number(filters.minRating) };
    }
    
    if (filters.tags) {
      query.tags = { $in: filters.tags.split(',') };
    }
    
    if (filters.hasDelivery !== undefined) {
      query.deliveryFee = filters.hasDelivery === 'true' 
        ? { $gt: 0 } 
        : { $eq: 0 };
    }

    const [restaurants, total] = await Promise.all([
      Restaurant.find(query)
        .populate('createdBy', 'name phone')
        .populate({
          path: 'items',
          match: { isAvailable: true },
          options: { limit: 5 },
        })
        .sort(sort)
        .skip(skip)
        .limit(limit),
      
      Restaurant.countDocuments(query),
    ]);

    // ✅ إضافة isFavorite للمستخدم المسجل
    let restaurantsWithFavorites = restaurants;
    
    if (req.user) {
      const favorites = await Favorite.find({ userId: req.user.id });
      const favoriteIds = favorites.map(f => f.restaurantId.toString());
      
      restaurantsWithFavorites = restaurants.map(restaurant => {
        const rest = restaurant.toObject();
        rest.isFavorite = favoriteIds.includes(rest._id.toString());
        return rest;
      });
    }

    // جلب إحصائيات البحث
    const stats = {
      types: await Restaurant.distinct('type', query),
      averageRating: await Restaurant.aggregate([
        { $match: query },
        { $group: { _id: null, avg: { $avg: '$averageRating' } } },
      ]),
      countByType: await Restaurant.aggregate([
        { $match: query },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    };

    const response = PaginationUtils.createPaginationResponse(
      restaurantsWithFavorites,
      total,
      paginationOptions,
      { stats }
    );
    
    res.json(response);
  } catch (error) {
    console.error('Advanced search error:', error);
    res.status(500).json({ message: 'Search failed' });
  }
};