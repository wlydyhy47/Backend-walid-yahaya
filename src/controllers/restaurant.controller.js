// ============================================
// ملف: src/controllers/restaurant.controller.js
// الوصف: التحكم الكامل في عمليات المطاعم
// الإصدار: 3.0 (موحد - بدون تكرار)
// ============================================

const Restaurant = require("../models/restaurant.model");
const RestaurantAddress = require("../models/restaurantAddress.model");
const Item = require("../models/item.model");
const Review = require("../models/review.model");
const Favorite = require("../models/favorite.model");
const Order = require("../models/order.model");
const User = require("../models/user.model");
const cloudinary = require("../config/cloudinary");
const cache = require("../utils/cache.util");
const fileService = require('../services/file.service');
const PaginationUtils = require('../utils/pagination.util');
const QueryBuilder = require('../utils/queryBuilder.util');
const { AppError } = require('../middlewares/errorHandler.middleware');
const upload = require("../middlewares/upload");

// ========== 1. دوال البحث والتصفح العامة ==========

/**
 * @desc    الحصول على جميع المطاعم مع Pagination
 * @route   GET /api/restaurants
 * @access  Public
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
        { tags: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (filters.type) {
      query.type = filters.type;
    }
    
    if (filters.tags) {
      query.tags = { $in: filters.tags.split(',') };
    }
    
    if (filters.minRating) {
      query.averageRating = { $gte: Number(filters.minRating) };
    }
    
    if (filters.hasDelivery !== undefined) {
      query.deliveryFee = filters.hasDelivery === 'true' ? { $gt: 0 } : 0;
    }

    const cacheKey = `restaurants:${JSON.stringify(query)}:${skip}:${limit}:${JSON.stringify(sort)}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log('📦 Serving paginated restaurants from cache');
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    console.log(`🔄 Fetching restaurants (page ${paginationOptions.page})`);
    
    const [restaurants, total] = await Promise.all([
      Restaurant.find(query)
        .select('name image coverImage description type averageRating ratingsCount deliveryFee estimatedDeliveryTime tags openingHours isOpen')
        .populate('createdBy', 'name phone')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      
      Restaurant.countDocuments(query)
    ]);

    const restaurantsWithDetails = await Promise.all(
      restaurants.map(async (restaurant) => {
        const itemsCount = await Item.countDocuments({
          restaurant: restaurant._id,
          isAvailable: true
        });
        
        const addresses = await RestaurantAddress.find({
          restaurant: restaurant._id
        })
        .select('addressLine city latitude longitude')
        .limit(3)
        .lean();
        
        let isFavorite = false;
        if (req.user) {
          isFavorite = await Favorite.isFavorite(req.user.id, restaurant._id);
        }

        const optimizedImages = {};
        if (restaurant.image) {
          const publicId = fileService.extractPublicIdFromUrl(restaurant.image);
          if (publicId) {
            optimizedImages.thumbnail = fileService.getOptimizedUrl(publicId, 'thumbnail');
            optimizedImages.small = fileService.getOptimizedUrl(publicId, 'small');
            optimizedImages.medium = fileService.getOptimizedUrl(publicId, 'medium');
          }
        }

        return {
          ...restaurant,
          addresses,
          itemsCount,
          isFavorite,
          optimizedImages,
          stats: {
            itemsCount,
            addressesCount: addresses.length,
            reviewsCount: restaurant.ratingsCount || 0
          }
        };
      })
    );

    const stats = {
      totalCount: await Restaurant.countDocuments({ isOpen: true }),
      byType: await Restaurant.aggregate([
        { $match: { isOpen: true } },
        { $group: { _id: "$type", count: { $sum: 1 } } }
      ]),
      averageRating: await Restaurant.aggregate([
        { $match: { isOpen: true } },
        { $group: { _id: null, avg: { $avg: "$averageRating" } } }
      ])
    };

    const responseData = PaginationUtils.createPaginationResponse(
      restaurantsWithDetails,
      total,
      paginationOptions,
      {
        stats,
        filtersApplied: Object.keys(filters).length > 0 ? filters : null
      }
    );

    cache.set(cacheKey, responseData, 300);
    
    res.json(responseData);
  } catch (error) {
    console.error('❌ Pagination error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch restaurants' 
    });
  }
};

/**
 * @desc    البحث الذكي باستخدام QueryBuilder
 * @route   GET /api/restaurants/smart
 * @access  Public
 */
exports.getRestaurantsSmart = async (req, res) => {
  try {
    const builder = new QueryBuilder(Restaurant, req.query);
    
    const { data, total } = await builder
      .filterIfExists('type')
      .filterIfExists('isOpen')
      .search(['name', 'description', 'tags'])
      .rangeFilter('averageRating', 'minRating', 'maxRating')
      .rangeFilter('deliveryFee', 'minFee', 'maxFee')
      .paginate()
      .execute();

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        total
      }
    });
  } catch (error) {
    console.error('❌ Smart search error:', error);
    res.status(500).json({
      success: false,
      message: 'Smart search failed'
    });
  }
};

/**
 * @desc    البحث الأساسي
 * @route   GET /api/restaurants/search
 * @access  Public
 */
exports.searchRestaurants = async (req, res) => {
  try {
    const { name, type, city, minRating } = req.query;
    const filter = { isOpen: true };

    if (name) {
      filter.name = { $regex: name, $options: "i" };
    }
    
    if (type) {
      filter.type = type;
    }
    
    if (minRating) {
      filter.averageRating = { $gte: Number(minRating) };
    }

    const restaurants = await Restaurant.find(filter)
      .select('name image description type averageRating deliveryFee estimatedDeliveryTime')
      .populate("createdBy", "name phone")
      .limit(20)
      .lean();

    let results = restaurants;
    if (city) {
      const restaurantIds = await RestaurantAddress.find({ 
        city: { $regex: city, $options: "i" } 
      }).distinct('restaurant');
      
      results = restaurants.filter(r => 
        restaurantIds.includes(r._id.toString())
      );
    }

    if (req.user) {
      const favorites = await Favorite.find({ 
        user: req.user.id,
        isActive: true 
      });
      const favoriteIds = favorites.map(f => f.restaurant.toString());
      
      results = results.map(restaurant => ({
        ...restaurant,
        isFavorite: favoriteIds.includes(restaurant._id.toString())
      }));
    }

    res.json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (error) {
    console.error("❌ Search error:", error);
    res.status(500).json({ 
      success: false,
      message: "Search failed" 
    });
  }
};

/**
 * @desc    بحث متقدم مع Pagination
 * @route   GET /api/restaurants/search/advanced
 * @access  Public
 */
exports.advancedSearch = async (req, res) => {
  try {
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;
    
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

    if (filters.minFee || filters.maxFee) {
      query.deliveryFee = {};
      if (filters.minFee) query.deliveryFee.$gte = Number(filters.minFee);
      if (filters.maxFee) query.deliveryFee.$lte = Number(filters.maxFee);
    }

    const [restaurants, total] = await Promise.all([
      Restaurant.find(query)
        .populate('createdBy', 'name phone')
        .populate({
          path: 'items',
          match: { isAvailable: true },
          options: { limit: 5 }
        })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      
      Restaurant.countDocuments(query)
    ]);

    let restaurantsWithDetails = restaurants;
    
    if (req.user) {
      const favorites = await Favorite.find({ 
        user: req.user.id,
        isActive: true 
      });
      const favoriteIds = favorites.map(f => f.restaurant.toString());
      
      restaurantsWithDetails = await Promise.all(restaurants.map(async (restaurant) => {
        const addresses = await RestaurantAddress.find({
          restaurant: restaurant._id
        }).limit(2).lean();
        
        return {
          ...restaurant,
          isFavorite: favoriteIds.includes(restaurant._id.toString()),
          addresses
        };
      }));
    }

    const stats = {
      types: await Restaurant.distinct('type', query),
      averageRating: await Restaurant.aggregate([
        { $match: query },
        { $group: { _id: null, avg: { $avg: '$averageRating' } } }
      ]),
      countByType: await Restaurant.aggregate([
        { $match: query },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      priceRange: await Restaurant.aggregate([
        { $match: query },
        { 
          $group: { 
            _id: null, 
            minFee: { $min: '$deliveryFee' },
            maxFee: { $max: '$deliveryFee' },
            avgFee: { $avg: '$deliveryFee' }
          } 
        }
      ])
    };

    const response = PaginationUtils.createPaginationResponse(
      restaurantsWithDetails,
      total,
      paginationOptions,
      { stats }
    );
    
    res.json(response);
  } catch (error) {
    console.error('❌ Advanced search error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Advanced search failed' 
    });
  }
};

// ========== 2. دوال تفاصيل المطعم ==========

/**
 * @desc    الحصول على مطعم مع العناوين
 * @route   GET /api/restaurants/:id/details
 * @access  Public
 */
exports.getRestaurantWithAddress = async (req, res) => {
  try {
    const restaurantId = req.params.id;

    const restaurant = await Restaurant.findById(restaurantId)
      .populate("createdBy", "name email phone")
      .lean();

    if (!restaurant) {
      return res.status(404).json({ 
        success: false,
        message: "Restaurant not found" 
      });
    }

    const addresses = await RestaurantAddress.find({
      restaurant: restaurantId
    }).lean();

    let isFavorite = false;
    if (req.user) {
      isFavorite = await Favorite.isFavorite(req.user.id, restaurantId);
    }

    const [itemsCount, reviewsCount, ordersCount] = await Promise.all([
      Item.countDocuments({ restaurant: restaurantId, isAvailable: true }),
      Review.countDocuments({ restaurant: restaurantId }),
      Order.countDocuments({ restaurant: restaurantId, status: 'delivered' })
    ]);

    const optimizedImages = {};
    if (restaurant.image) {
      const publicId = fileService.extractPublicIdFromUrl(restaurant.image);
      if (publicId) {
        optimizedImages.thumbnail = fileService.getOptimizedUrl(publicId, 'thumbnail');
        optimizedImages.small = fileService.getOptimizedUrl(publicId, 'small');
        optimizedImages.medium = fileService.getOptimizedUrl(publicId, 'medium');
        optimizedImages.large = fileService.getOptimizedUrl(publicId, 'large');
      }
    }

    if (restaurant.coverImage) {
      const coverPublicId = fileService.extractPublicIdFromUrl(restaurant.coverImage);
      if (coverPublicId) {
        optimizedImages.cover = fileService.getOptimizedUrl(coverPublicId, 'cover');
      }
    }

    const restaurantWithDetails = {
      ...restaurant,
      addresses,
      isFavorite,
      optimizedImages,
      stats: {
        itemsCount,
        reviewsCount,
        ordersCount,
        addressesCount: addresses.length
      }
    };

    res.json({
      success: true,
      data: restaurantWithDetails
    });
  } catch (error) {
    console.error("❌ Error in getRestaurantWithAddress:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch restaurant info" 
    });
  }
};

/**
 * @desc    الحصول على تفاصيل مطعم كاملة
 * @route   GET /api/restaurants/:id
 * @access  Public
 */
exports.getRestaurantCompleteDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const cacheKey = `restaurant:complete:${id}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log(`🏪 Serving complete restaurant ${id} from cache`);
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    console.log(`🔄 Fetching complete restaurant ${id} from database`);
    
    const [
      restaurant,
      addresses,
      reviews,
      items,
      categories,
      stats
    ] = await Promise.all([
      Restaurant.findById(id)
        .populate('createdBy', 'name phone email')
        .lean(),
      
      RestaurantAddress.find({ restaurant: id })
        .select('addressLine city latitude longitude isDefault')
        .lean(),
      
      Review.find({ restaurant: id })
        .populate('user', 'name image')
        .select('rating comment createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      
      Item.find({ restaurant: id, isAvailable: true })
        .select('name price image description category ingredients preparationTime isVegetarian isVegan spicyLevel')
        .sort({ category: 1, name: 1 })
        .lean(),
      
      Item.distinct('category', { restaurant: id, isAvailable: true }),
      
      exports.getRestaurantStats(id)
    ]);

    if (!restaurant) {
      return res.status(404).json({ 
        success: false, 
        message: 'Restaurant not found' 
      });
    }

    if (restaurant.image) {
      const publicId = fileService.extractPublicIdFromUrl(restaurant.image);
      if (publicId) {
        restaurant.optimizedImages = fileService.getAllSizes(publicId);
      }
    }

    let isFavorite = false;
    if (req.user) {
      isFavorite = await Favorite.isFavorite(req.user.id, id);
    }

    const reviewStats = await Review.aggregate([
      { $match: { restaurant: id } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          ratingDistribution: {
            $push: {
              rating: '$rating',
              count: 1
            }
          }
        }
      }
    ]);

    const ratingDistribution = {};
    if (reviewStats[0]?.ratingDistribution) {
      reviewStats[0].ratingDistribution.forEach(r => {
        ratingDistribution[r.rating] = (ratingDistribution[r.rating] || 0) + 1;
      });
    }

    const responseData = {
      success: true,
      data: {
        restaurant: {
          ...restaurant,
          stats: {
            itemsCount: items.length,
            addressesCount: addresses.length,
            reviewsCount: reviewStats[0]?.totalReviews || 0,
            averageRating: reviewStats[0]?.averageRating || 0,
            ratingDistribution,
            ...stats
          }
        },
        addresses,
        reviews,
        items,
        categories,
        isFavorite
      },
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 300);
    
    res.json(responseData);
  } catch (error) {
    console.error('❌ Get complete restaurant error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch restaurant details'
    });
  }
};

/**
 * @desc    الحصول على عناصر المطعم
 * @route   GET /api/restaurants/:id/items
 * @access  Public
 */
exports.getRestaurantItems = async (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.query;

    const query = { restaurant: id, isAvailable: true };
    if (category) {
      query.category = category;
    }

    const items = await Item.find(query)
      .select('name price image description category ingredients preparationTime isVegetarian isVegan spicyLevel')
      .sort({ category: 1, name: 1 })
      .lean();

    const groupedByCategory = items.reduce((acc, item) => {
      const cat = item.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        items,
        groupedByCategory,
        categories: Object.keys(groupedByCategory),
        total: items.length
      }
    });
  } catch (error) {
    console.error('❌ Get restaurant items error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch restaurant items'
    });
  }
};

/**
 * @desc    إنشاء عنصر قائمة جديد
 * @route   POST /api/restaurants/:id/items
 * @access  Admin
 */
exports.createMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, description, category, ingredients, preparationTime, spicyLevel, isVegetarian, isVegan } = req.body;

    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: 'Name and price are required'
      });
    }

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    const item = await Item.create({
      name: name.trim(),
      price: Number(price),
      restaurant: id,
      image: req.file ? req.file.path : null,
      description: description?.trim(),
      category: category || 'main',
      ingredients: ingredients ? ingredients.split(',').map(i => i.trim()) : [],
      preparationTime: preparationTime ? Number(preparationTime) : 15,
      spicyLevel: spicyLevel ? Number(spicyLevel) : 0,
      isVegetarian: isVegetarian === 'true',
      isVegan: isVegan === 'true'
    });

    cache.del(`restaurant:complete:${id}`);
    cache.invalidatePattern(`restaurants:*`);

    res.status(201).json({
      success: true,
      message: 'Menu item created successfully',
      data: item
    });
  } catch (error) {
    console.error('❌ Create menu item error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create menu item'
    });
  }
};

/**
 * @desc    تحديث عنصر قائمة
 * @route   PUT /api/restaurants/:id/items/:itemId
 * @access  Admin
 */
exports.updateMenuItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { name, price, description, category, isAvailable, ingredients, preparationTime, spicyLevel, isVegetarian, isVegan } = req.body;

    const item = await Item.findOne({ _id: itemId, restaurant: id });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    if (name) item.name = name.trim();
    if (price) item.price = Number(price);
    if (description !== undefined) item.description = description?.trim();
    if (category) item.category = category;
    if (isAvailable !== undefined) item.isAvailable = isAvailable;
    if (preparationTime) item.preparationTime = Number(preparationTime);
    if (spicyLevel !== undefined) item.spicyLevel = Number(spicyLevel);
    if (isVegetarian !== undefined) item.isVegetarian = isVegetarian;
    if (isVegan !== undefined) item.isVegan = isVegan;
    
    if (ingredients) {
      item.ingredients = ingredients.split(',').map(i => i.trim());
    }

    await item.save();

    cache.del(`restaurant:complete:${id}`);
    cache.invalidatePattern(`restaurants:*`);

    res.json({
      success: true,
      message: 'Menu item updated successfully',
      data: item
    });
  } catch (error) {
    console.error('❌ Update menu item error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update menu item'
    });
  }
};

/**
 * @desc    حذف عنصر قائمة
 * @route   DELETE /api/restaurants/:id/items/:itemId
 * @access  Admin
 */
exports.deleteMenuItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const item = await Item.findOneAndDelete({ _id: itemId, restaurant: id });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    if (item.image) {
      const publicId = fileService.extractPublicIdFromUrl(item.image);
      if (publicId) {
        fileService.deleteFile(publicId).catch(err => 
          console.error('Error deleting item image:', err)
        );
      }
    }

    cache.del(`restaurant:complete:${id}`);
    cache.invalidatePattern(`restaurants:*`);

    res.json({
      success: true,
      message: 'Menu item deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete menu item error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete menu item'
    });
  }
};

// ========== 3. دوال التقييمات ==========

/**
 * @desc    إضافة تقييم لمطعم
 * @route   POST /api/restaurants/:id/reviews
 * @access  Authenticated (Client only)
 */
exports.addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const restaurantId = req.params.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5"
      });
    }

    const existingReview = await Review.findOne({
      user: req.user.id,
      restaurant: restaurantId
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You already rated this restaurant"
      });
    }

    const hasOrdered = await Order.findOne({
      user: req.user.id,
      restaurant: restaurantId,
      status: 'delivered'
    });

    if (!hasOrdered && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: "You can only review restaurants you've ordered from"
      });
    }

    const review = await Review.create({
      user: req.user.id,
      restaurant: restaurantId,
      rating,
      comment: comment?.trim()
    });

    const stats = await Review.aggregate([
      { $match: { restaurant: restaurantId } },
      {
        $group: {
          _id: "$restaurant",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 }
        }
      }
    ]);

    await Restaurant.findByIdAndUpdate(restaurantId, {
      averageRating: stats[0]?.avgRating || rating,
      ratingsCount: stats[0]?.count || 1
    });

    cache.del(`restaurant:complete:${restaurantId}`);
    cache.invalidatePattern(`restaurants:*`);

    const populatedReview = await Review.findById(review._id)
      .populate('user', 'name image')
      .lean();

    res.status(201).json({
      success: true,
      message: "Review added successfully",
      data: populatedReview
    });
  } catch (error) {
    console.error("❌ Error in addReview:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false,
        message: "You already rated this restaurant" 
      });
    }

    res.status(500).json({ 
      success: false,
      message: "Failed to add review" 
    });
  }
};

/**
 * @desc    الحصول على تقييمات مطعم
 * @route   GET /api/restaurants/:id/reviews
 * @access  Public
 */
exports.getRestaurantReviews = async (req, res) => {
  try {
    const restaurantId = req.params.id;
    const { page = 1, limit = 10, sort = "-createdAt" } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total] = await Promise.all([
      Review.find({ restaurant: restaurantId })
        .populate("user", "name image")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      
      Review.countDocuments({ restaurant: restaurantId })
    ]);

    const stats = await Review.aggregate([
      { $match: { restaurant: restaurantId } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          ratingDistribution: {
            $push: {
              rating: "$rating",
              count: 1
            }
          }
        }
      }
    ]);

    const ratingDistribution = {};
    if (stats[0]?.ratingDistribution) {
      stats[0].ratingDistribution.forEach(r => {
        ratingDistribution[r.rating] = (ratingDistribution[r.rating] || 0) + 1;
      });
    }

    res.json({
      success: true,
      data: reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      stats: {
        averageRating: stats[0]?.averageRating || 0,
        totalReviews: stats[0]?.totalReviews || 0,
        ratingDistribution
      }
    });
  } catch (error) {
    console.error("❌ Error in getRestaurantReviews:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch reviews" 
    });
  }
};

// ========== 4. دوال العناوين ==========

/**
 * @desc    إنشاء عنوان لمطعم
 * @route   POST /api/restaurants/addresses
 * @access  Admin
 */
exports.createAddress = async (req, res) => {
  try {
    const { restaurantId, addressLine, city, latitude, longitude } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ 
        success: false,
        message: "Restaurant not found" 
      });
    }

    const address = await RestaurantAddress.create({
      restaurant: restaurantId,
      addressLine,
      city: city || "Niamey",
      latitude,
      longitude
    });

    cache.del(`restaurant:complete:${restaurantId}`);
    cache.invalidatePattern(`restaurants:*`);

    res.status(201).json({
      success: true,
      message: "Address created successfully",
      data: address
    });
  } catch (error) {
    console.error("❌ Error in createAddress:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to create restaurant address" 
    });
  }
};

/**
 * @desc    جلب عناوين مطعم
 * @route   GET /api/restaurants/:restaurantId/addresses
 * @access  Public
 */
exports.getAddresses = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const addresses = await RestaurantAddress.find({
      restaurant: restaurantId
    }).lean();

    res.json({
      success: true,
      data: addresses
    });
  } catch (error) {
    console.error("❌ Error in getAddresses:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch restaurant addresses" 
    });
  }
};

/**
 * @desc    تحديث عنوان مطعم
 * @route   PUT /api/restaurants/addresses/:id
 * @access  Admin
 */
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { addressLine, city, latitude, longitude } = req.body;

    const address = await RestaurantAddress.findByIdAndUpdate(
      id,
      { addressLine, city, latitude, longitude },
      { new: true, runValidators: true }
    );

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    cache.del(`restaurant:complete:${address.restaurant}`);
    cache.invalidatePattern(`restaurants:*`);

    res.json({
      success: true,
      message: "Address updated successfully",
      data: address
    });
  } catch (error) {
    console.error("❌ Error in updateAddress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update address"
    });
  }
};

/**
 * @desc    حذف عنوان مطعم
 * @route   DELETE /api/restaurants/addresses/:id
 * @access  Admin
 */
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await RestaurantAddress.findByIdAndDelete(id);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    cache.del(`restaurant:complete:${address.restaurant}`);
    cache.invalidatePattern(`restaurants:*`);

    res.json({
      success: true,
      message: "Address deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error in deleteAddress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete address"
    });
  }
};

// ========== 5. دوال الإدارة (للمسؤول) ==========

/**
 * @desc    إنشاء مطعم جديد
 * @route   POST /api/restaurants
 * @access  Admin
 */
exports.createRestaurant = async (req, res) => {
  try {
    const { name, description, type, phone, email, deliveryFee, minOrderAmount, estimatedDeliveryTime, tags, openingHours } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Restaurant name is required"
      });
    }

    const tagsArray = tags 
      ? tags.split(',').map(tag => tag.trim()).filter(tag => tag)
      : [];

    let openingHoursObj = {};
    try {
      openingHoursObj = openingHours ? JSON.parse(openingHours) : {};
    } catch (e) {}

    const restaurant = await Restaurant.create({
      name: name.trim(),
      description: description?.trim(),
      type: type || "restaurant",
      phone: phone?.trim(),
      email: email?.trim(),
      image: req.files?.image ? req.files.image[0].path : null,
      coverImage: req.files?.coverImage ? req.files.coverImage[0].path : null,
      deliveryFee: Number(deliveryFee) || 0,
      minOrderAmount: Number(minOrderAmount) || 0,
      estimatedDeliveryTime: Number(estimatedDeliveryTime) || 30,
      tags: tagsArray,
      openingHours: openingHoursObj,
      createdBy: req.user.id,
      isOpen: true
    });

    const optimizedImages = {};
    if (restaurant.image) {
      const publicId = fileService.extractPublicIdFromUrl(restaurant.image);
      if (publicId) {
        optimizedImages.thumbnail = fileService.getOptimizedUrl(publicId, 'thumbnail');
        optimizedImages.medium = fileService.getOptimizedUrl(publicId, 'medium');
      }
    }

    cache.invalidatePattern('restaurants:*');
    cache.invalidatePattern('home:*');

    await restaurant.populate("createdBy", "name email phone");

    res.status(201).json({
      success: true,
      message: "Restaurant created successfully",
      data: {
        ...restaurant.toObject(),
        optimizedImages
      }
    });
  } catch (error) {
    console.error("❌ Error in createRestaurant:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to create restaurant" 
    });
  }
};

/**
 * @desc    إنشاء مطعم كامل (متقدم مع عناوين وعناصر)
 * @route   POST /api/restaurants/complete
 * @access  Admin
 */
exports.createCompleteRestaurant = async (req, res) => {
  try {
    console.log("🚀 Starting complete restaurant creation...");

    const {
      name, description, type = "restaurant", phone, email,
      deliveryFee = 0, minOrderAmount = 0, estimatedDeliveryTime = 30,
      tags = "", addresses = "[]", items = "[]", openingHours = "{}"
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Restaurant name is required"
      });
    }

    let addressesArray = [], itemsArray = [], openingHoursObj = {};
    try {
      addressesArray = JSON.parse(addresses);
      itemsArray = JSON.parse(items);
      openingHoursObj = JSON.parse(openingHours);
    } catch (parseError) {
      console.error("❌ JSON parsing error:", parseError);
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format in addresses, items, or openingHours"
      });
    }

    const tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag);

    console.log(`📊 Processing: ${name} (${addressesArray.length} addresses, ${itemsArray.length} items)`);

    let imageUrl = null, coverImageUrl = null;

    if (req.files?.image) {
      const imageResult = await cloudinary.uploader.upload(req.files.image[0].path, {
        folder: "restaurants/main",
        transformation: [{ width: 800, height: 600, crop: "fill" }, { quality: "auto:good" }]
      });
      imageUrl = imageResult.secure_url;
    }

    if (req.files?.coverImage) {
      const coverResult = await cloudinary.uploader.upload(req.files.coverImage[0].path, {
        folder: "restaurants/covers",
        transformation: [{ width: 1200, height: 400, crop: "fill" }, { quality: "auto:good" }]
      });
      coverImageUrl = coverResult.secure_url;
    }

    const restaurant = await Restaurant.create({
      name: name.trim(),
      description: description?.trim(),
      type,
      phone: phone?.trim(),
      email: email?.trim(),
      image: imageUrl,
      coverImage: coverImageUrl,
      deliveryFee: Number(deliveryFee),
      minOrderAmount: Number(minOrderAmount),
      estimatedDeliveryTime: Number(estimatedDeliveryTime),
      tags: tagsArray,
      openingHours: openingHoursObj,
      createdBy: req.user.id,
      isOpen: true
    });

    console.log("✅ Restaurant created with ID:", restaurant._id);

    let createdAddresses = [];
    if (addressesArray.length > 0) {
      const addressPromises = addressesArray.map(async (addressData) => {
        return await RestaurantAddress.create({
          restaurant: restaurant._id,
          addressLine: addressData.addressLine?.trim(),
          city: addressData.city?.trim() || "Niamey",
          latitude: addressData.latitude ? Number(addressData.latitude) : null,
          longitude: addressData.longitude ? Number(addressData.longitude) : null
        });
      });
      createdAddresses = await Promise.all(addressPromises);
      console.log(`✅ Created ${createdAddresses.length} addresses`);
    }

    let createdItems = [];
    if (itemsArray.length > 0 && req.files?.itemImages) {
      const itemImages = req.files.itemImages || [];

      const itemPromises = itemsArray.map(async (itemData, index) => {
        let itemImageUrl = null;

        const matchingImage = itemImages.find(img => 
          img.fieldname === `items[${index}][image]`
        );

        if (matchingImage) {
          const imageResult = await cloudinary.uploader.upload(matchingImage.path, {
            folder: `restaurants/${restaurant._id}/items`,
            transformation: [{ width: 500, height: 500, crop: "fill" }, { quality: "auto:good" }]
          });
          itemImageUrl = imageResult.secure_url;
        }

        return await Item.create({
          name: itemData.name?.trim(),
          price: Number(itemData.price) || 0,
          description: itemData.description?.trim(),
          category: itemData.category?.trim() || "main",
          image: itemImageUrl,
          restaurant: restaurant._id,
          isAvailable: true
        });
      });

      createdItems = await Promise.all(itemPromises);
      console.log(`✅ Created ${createdItems.length} menu items`);
    }

    cache.invalidatePattern("restaurants:*");
    cache.invalidatePattern("home:*");

    res.status(201).json({
      success: true,
      message: "Restaurant created successfully",
      data: {
        restaurant,
        addresses: createdAddresses,
        items: createdItems,
        summary: {
          addressesCount: createdAddresses.length,
          itemsCount: createdItems.length,
          imagesCount: (imageUrl ? 1 : 0) + (coverImageUrl ? 1 : 0)
        }
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error("❌ Complete restaurant creation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create complete restaurant",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * @desc    تحديث بيانات المطعم
 * @route   PUT /api/restaurants/:id
 * @access  Admin
 */
exports.updateRestaurant = async (req, res) => {
  try {
    const { name, description, type, isOpen, phone, email, deliveryFee, minOrderAmount, estimatedDeliveryTime, tags, openingHours } = req.body;
    const restaurantId = req.params.id;

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (type) updateData.type = type;
    if (isOpen !== undefined) updateData.isOpen = isOpen;
    if (phone) updateData.phone = phone.trim();
    if (email) updateData.email = email?.trim();
    if (deliveryFee !== undefined) updateData.deliveryFee = Number(deliveryFee);
    if (minOrderAmount !== undefined) updateData.minOrderAmount = Number(minOrderAmount);
    if (estimatedDeliveryTime !== undefined) updateData.estimatedDeliveryTime = Number(estimatedDeliveryTime);
    
    if (tags) {
      updateData.tags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    }
    
    if (openingHours) {
      try {
        updateData.openingHours = JSON.parse(openingHours);
      } catch (e) {}
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found"
      });
    }

    cache.del(`restaurant:complete:${restaurantId}`);
    cache.invalidatePattern('restaurants:*');
    cache.invalidatePattern('home:*');

    res.json({
      success: true,
      message: "Restaurant updated successfully",
      data: restaurant,
      updatedFields: Object.keys(updateData)
    });
  } catch (error) {
    console.error("❌ Error in updateRestaurant:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to update restaurant" 
    });
  }
};

/**
 * @desc    تحديث صورة الغلاف
 * @route   PUT /api/restaurants/:id/cover
 * @access  Admin
 */
exports.updateCoverImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: "No image uploaded" 
      });
    }

    const restaurantId = req.params.id;

    const oldRestaurant = await Restaurant.findById(restaurantId).select('coverImage');
    if (oldRestaurant?.coverImage) {
      const oldPublicId = fileService.extractPublicIdFromUrl(oldRestaurant.coverImage);
      if (oldPublicId) {
        fileService.deleteFile(oldPublicId).catch(err => 
          console.error('Error deleting old cover:', err)
        );
      }
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { coverImage: req.file.path },
      { new: true }
    );

    if (!restaurant) {
      return res.status(404).json({ 
        success: false,
        message: "Restaurant not found" 
      });
    }

    cache.del(`restaurant:complete:${restaurantId}`);
    cache.invalidatePattern('restaurants:*');

    res.json({
      success: true,
      message: "Cover image updated successfully",
      data: {
        coverImage: restaurant.coverImage,
        optimized: req.file.thumbnail || null
      }
    });
  } catch (error) {
    console.error("❌ Error in updateCoverImage:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to update cover image" 
    });
  }
};

/**
 * @desc    حذف مطعم
 * @route   DELETE /api/restaurants/:id
 * @access  Admin
 */
exports.deleteRestaurant = async (req, res) => {
  try {
    const restaurantId = req.params.id;

    const restaurant = await Restaurant.findById(restaurantId);
    if (restaurant) {
      if (restaurant.image) {
        const publicId = fileService.extractPublicIdFromUrl(restaurant.image);
        if (publicId) fileService.deleteFile(publicId);
      }
      if (restaurant.coverImage) {
        const publicId = fileService.extractPublicIdFromUrl(restaurant.coverImage);
        if (publicId) fileService.deleteFile(publicId);
      }
    }

    await Restaurant.findByIdAndDelete(restaurantId);

    cache.invalidatePattern('restaurants:*');
    cache.invalidatePattern('home:*');
    cache.del(`restaurant:complete:${restaurantId}`);

    res.json({ 
      success: true,
      message: "Restaurant deleted successfully" 
    });
  } catch (error) {
    console.error("❌ Error in deleteRestaurant:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to delete restaurant" 
    });
  }
};

/**
 * @desc    تحديث حالة المطعم (مفتوح/مغلق)
 * @route   PUT /api/restaurants/:id/toggle-status
 * @access  Admin / Restaurant Owner
 */
exports.toggleRestaurantStatus = async (req, res) => {
  try {
    const restaurantId = req.params.id;
    
    const restaurant = await Restaurant.findById(restaurantId);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found"
      });
    }

    restaurant.isOpen = !restaurant.isOpen;
    await restaurant.save();

    cache.del(`restaurant:complete:${restaurantId}`);
    cache.invalidatePattern('restaurants:*');

    res.json({
      success: true,
      message: restaurant.isOpen ? "Restaurant is now open" : "Restaurant is now closed",
      data: {
        isOpen: restaurant.isOpen,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error("❌ Error in toggleRestaurantStatus:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle restaurant status"
    });
  }
};

/**
 * @desc    تحديث مطعم كامل (للتطوير المستقبلي)
 * @route   PUT /api/restaurants/:id/complete
 * @access  Admin
 */
exports.updateCompleteRestaurant = async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Complete update endpoint will be implemented soon",
      note: "Use separate endpoints for updating restaurant, addresses, and items"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Update failed",
    });
  }
};

/**
 * @desc    الحصول على إحصائيات المطعم
 * @access  Internal
 */
exports.getRestaurantStats = async (restaurantId) => {
  try {
    const [
      itemsCount,
      reviewsCount,
      ordersCount,
      ratingDistribution,
      popularItems
    ] = await Promise.all([
      Item.countDocuments({ restaurant: restaurantId, isAvailable: true }),
      
      Review.countDocuments({ restaurant: restaurantId }),
      
      Order.countDocuments({ restaurant: restaurantId, status: 'delivered' }),
      
      Review.aggregate([
        { $match: { restaurant: restaurantId } },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      Order.aggregate([
        { $match: { restaurant: restaurantId, status: 'delivered' } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            totalSold: { $sum: "$items.qty" },
            totalRevenue: { $sum: { $multiply: ["$items.price", "$items.qty"] } }
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 }
      ])
    ]);

    return {
      items: itemsCount,
      reviews: reviewsCount,
      orders: ordersCount,
      ratingDistribution: ratingDistribution.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      popularItems,
      lastUpdated: new Date()
    };
  } catch (error) {
    console.error("❌ Error in getRestaurantStats:", error);
    return {
      items: 0,
      reviews: 0,
      orders: 0,
      ratingDistribution: {},
      popularItems: []
    };
  }
};

/**
 * @desc    Middleware لرفع ملفات المطعم
 */
exports.uploadRestaurantFiles = (req, res, next) => {
  const uploadFields = upload("restaurants").fields([
    { name: "image", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
    { name: "itemImages", maxCount: 20 }
  ]);

  uploadFields(req, res, function (err) {
    if (err) {
      console.error("❌ File upload error:", err);
      return res.status(400).json({
        success: false,
        message: "File upload failed",
        error: err.message,
      });
    }
    next();
  });
};

module.exports = exports;