// ============================================
// ملف: src/controllers/item.controller.js
// الوصف: إدارة عناصر القائمة
// الإصدار: 2.0 (محدث)
// ============================================

const Item = require("../models/item.model");
const Restaurant = require("../models/restaurant.model");
const cache = require("../utils/cache.util");
const PaginationUtils = require('../utils/pagination.util');
const fileService = require('../services/file.service');
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة ==========

/**
 * إبطال كاش العناصر
 */
const invalidateItemCache = (restaurantId) => {
  cache.invalidatePattern('items:*');
  if (restaurantId) {
    cache.del(`restaurant:full:${restaurantId}`);
    cache.invalidatePattern(`restaurants:*`);
  }
};

/**
 * التحقق من وجود المطعم
 */
const validateRestaurant = async (restaurantId) => {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    throw new AppError('المطعم غير موجود', 404);
  }
  return restaurant;
};

// ========== 2. دوال عامة ==========

/**
 * @desc    الحصول على جميع العناصر مع Pagination
 * @route   GET /api/items
 * @access  Public
 */
exports.getItemsPaginated = async (req, res) => {
  try {
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;
    
    let query = { isAvailable: true };
    
    // فلاتر البحث
    if (filters.restaurant) {
      query.restaurant = filters.restaurant;
    }
    
    if (filters.category) {
      query.category = filters.category;
    }
    
    if (filters.minPrice || filters.maxPrice) {
      query.price = {};
      if (filters.minPrice) query.price.$gte = Number(filters.minPrice);
      if (filters.maxPrice) query.price.$lte = Number(filters.maxPrice);
    }
    
    if (filters.isVegetarian !== undefined) {
      query.isVegetarian = filters.isVegetarian === 'true';
    }
    
    if (filters.isVegan !== undefined) {
      query.isVegan = filters.isVegan === 'true';
    }
    
    if (filters.spicyLevel) {
      query.spicyLevel = Number(filters.spicyLevel);
    }

    const cacheKey = `items:${JSON.stringify(query)}:${skip}:${limit}:${JSON.stringify(sort)}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log('🍽️ Serving items from cache');
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    const [items, total] = await Promise.all([
      Item.find(query)
        .populate('restaurant', 'name image type averageRating')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      
      Item.countDocuments(query)
    ]);

    // إضافة صور محسنة
    const itemsWithOptimized = items.map(item => {
      const optimized = {};
      if (item.image) {
        const publicId = fileService.extractPublicIdFromUrl(item.image);
        if (publicId) {
          optimized.thumbnail = fileService.getOptimizedUrl(publicId, 'thumbnail');
          optimized.small = fileService.getOptimizedUrl(publicId, 'small');
        }
      }
      return {
        ...item,
        optimizedImages: optimized
      };
    });

    // إحصائيات إضافية
    const categories = await Item.distinct('category', query);
    
    const priceStats = await Item.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          avgPrice: { $avg: '$price' }
        }
      }
    ]);

    const responseData = PaginationUtils.createPaginationResponse(
      itemsWithOptimized,
      total,
      paginationOptions,
      {
        categories,
        priceRange: priceStats[0] || { minPrice: 0, maxPrice: 0, avgPrice: 0 },
        totalRestaurants: await Item.distinct('restaurant', query).then(ids => ids.length)
      }
    );

    cache.set(cacheKey, responseData, 180); // 3 دقائق
    
    res.json(responseData);
  } catch (error) {
    console.error('❌ Pagination error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch items' 
    });
  }
};

/**
 * @desc    الحصول على عنصر محدد
 * @route   GET /api/items/:id
 * @access  Public
 */
exports.getItemById = async (req, res) => {
  try {
    const { id } = req.params;

    const cacheKey = `item:${id}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const item = await Item.findById(id)
      .populate('restaurant', 'name image phone address')
      .lean();

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // إضافة صور محسنة
    const optimizedImages = {};
    if (item.image) {
      const publicId = fileService.extractPublicIdFromUrl(item.image);
      if (publicId) {
        optimizedImages.thumbnail = fileService.getOptimizedUrl(publicId, 'thumbnail');
        optimizedImages.small = fileService.getOptimizedUrl(publicId, 'small');
        optimizedImages.medium = fileService.getOptimizedUrl(publicId, 'medium');
      }
    }

    const responseData = {
      ...item,
      optimizedImages
    };

    cache.set(cacheKey, responseData, 300); // 5 دقائق

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('❌ Get item error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid item ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch item'
    });
  }
};

// ========== 3. دوال الإدارة ==========

/**
 * @desc    إنشاء عنصر جديد
 * @route   POST /api/items
 * @access  Admin
 */
exports.createItem = async (req, res) => {
  try {
    const { name, price, restaurant, description, category, ingredients, preparationTime, spicyLevel, isVegetarian, isVegan, calories } = req.body;

    // التحقق من البيانات المطلوبة
    if (!name || !price || !restaurant) {
      return res.status(400).json({
        success: false,
        message: "Name, price, and restaurant are required"
      });
    }

    // التحقق من وجود المطعم
    await validateRestaurant(restaurant);

    // إنشاء العنصر
    const item = await Item.create({
      name: name.trim(),
      price: Number(price),
      restaurant,
      image: req.file ? req.file.path : null,
      description: description?.trim(),
      category: category || "main",
      ingredients: ingredients ? ingredients.split(',').map(i => i.trim()) : [],
      preparationTime: preparationTime ? Number(preparationTime) : 15,
      spicyLevel: spicyLevel ? Number(spicyLevel) : 0,
      isVegetarian: isVegetarian === 'true',
      isVegan: isVegan === 'true',
      calories: calories ? Number(calories) : null
    });

    // إبطال الكاش
    invalidateItemCache(restaurant);

    // جلب العنصر مع بيانات المطعم
    await item.populate("restaurant", "name image");

    // إضافة صور محسنة
    const optimizedImages = {};
    if (item.image) {
      const publicId = fileService.extractPublicIdFromUrl(item.image);
      if (publicId) {
        optimizedImages.thumbnail = fileService.getOptimizedUrl(publicId, 'thumbnail');
        optimizedImages.small = fileService.getOptimizedUrl(publicId, 'small');
      }
    }

    res.status(201).json({
      success: true,
      message: "Item created successfully",
      data: {
        ...item.toObject(),
        optimizedImages
      }
    });
  } catch (error) {
    console.error('❌ Create item error:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({ 
      success: false,
      message: "Failed to create item" 
    });
  }
};

/**
 * @desc    تحديث عنصر
 * @route   PUT /api/items/:id
 * @access  Admin
 */
exports.updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, description, category, isAvailable, ingredients, preparationTime, spicyLevel, isVegetarian, isVegan, calories } = req.body;

    const item = await Item.findById(id);
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found"
      });
    }

    const oldRestaurantId = item.restaurant;

    // تحديث الحقول
    if (name) item.name = name.trim();
    if (price) item.price = Number(price);
    if (description !== undefined) item.description = description?.trim();
    if (category) item.category = category;
    if (isAvailable !== undefined) item.isAvailable = isAvailable;
    if (preparationTime) item.preparationTime = Number(preparationTime);
    if (spicyLevel !== undefined) item.spicyLevel = Number(spicyLevel);
    if (isVegetarian !== undefined) item.isVegetarian = isVegetarian;
    if (isVegan !== undefined) item.isVegan = isVegan;
    if (calories !== undefined) item.calories = calories ? Number(calories) : null;
    
    if (ingredients) {
      item.ingredients = ingredients.split(',').map(i => i.trim());
    }

    await item.save();

    // إبطال الكاش
    invalidateItemCache(oldRestaurantId);

    res.json({
      success: true,
      message: "Item updated successfully",
      data: item
    });
  } catch (error) {
    console.error('❌ Update item error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({ 
      success: false,
      message: "Failed to update item" 
    });
  }
};

/**
 * @desc    تحديث صورة العنصر
 * @route   PUT /api/items/:id/image
 * @access  Admin
 */
exports.updateItemImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: "No image uploaded" 
      });
    }

    const item = await Item.findById(id);
    
    if (!item) {
      return res.status(404).json({ 
        success: false,
        message: "Item not found" 
      });
    }

    // حذف الصورة القديمة
    if (item.image) {
      const oldPublicId = fileService.extractPublicIdFromUrl(item.image);
      if (oldPublicId) {
        fileService.deleteFile(oldPublicId).catch(err => 
          console.error('Error deleting old item image:', err)
        );
      }
    }

    // تحديث الصورة
    item.image = req.file.path;
    await item.save();

    // إبطال الكاش
    invalidateItemCache(item.restaurant);

    // إضافة صور محسنة
    const optimizedImages = {};
    if (item.image) {
      const publicId = fileService.extractPublicIdFromUrl(item.image);
      if (publicId) {
        optimizedImages.thumbnail = fileService.getOptimizedUrl(publicId, 'thumbnail');
        optimizedImages.small = fileService.getOptimizedUrl(publicId, 'small');
        optimizedImages.medium = fileService.getOptimizedUrl(publicId, 'medium');
      }
    }

    res.json({
      success: true,
      message: "Item image updated successfully",
      data: {
        id: item._id,
        image: item.image,
        optimizedImages
      }
    });
  } catch (error) {
    console.error('❌ Update item image error:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to update item image" 
    });
  }
};

/**
 * @desc    حذف عنصر
 * @route   DELETE /api/items/:id
 * @access  Admin
 */
exports.deleteItem = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await Item.findById(id);
    
    if (!item) {
      return res.status(404).json({ 
        success: false,
        message: "Item not found" 
      });
    }

    // حذف الصورة من Cloudinary
    if (item.image) {
      const publicId = fileService.extractPublicIdFromUrl(item.image);
      if (publicId) {
        fileService.deleteFile(publicId).catch(err => 
          console.error('Error deleting item image:', err)
        );
      }
    }

    // حذف العنصر
    await Item.findByIdAndDelete(id);

    // إبطال الكاش
    invalidateItemCache(item.restaurant);

    res.json({ 
      success: true,
      message: "Item deleted successfully" 
    });
  } catch (error) {
    console.error('❌ Delete item error:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to delete item" 
    });
  }
};

/**
 * @desc    تبديل حالة التوفر
 * @route   PUT /api/items/:id/toggle-availability
 * @access  Admin
 */
exports.toggleAvailability = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await Item.findById(id);
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found"
      });
    }

    item.isAvailable = !item.isAvailable;
    await item.save();

    // إبطال الكاش
    invalidateItemCache(item.restaurant);

    res.json({
      success: true,
      message: `Item is now ${item.isAvailable ? 'available' : 'unavailable'}`,
      data: {
        id: item._id,
        isAvailable: item.isAvailable
      }
    });
  } catch (error) {
    console.error('❌ Toggle availability error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle availability"
    });
  }
};

/**
 * @desc    الحصول على عناصر حسب المطعم
 * @route   GET /api/items/restaurant/:restaurantId
 * @access  Public
 */
exports.getItemsByRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { category, isAvailable = true } = req.query;

    const query = { restaurant: restaurantId };
    if (isAvailable === 'true') query.isAvailable = true;
    if (category) query.category = category;

    const items = await Item.find(query)
      .sort({ category: 1, name: 1 })
      .lean();

    // تجميع العناصر حسب الفئة
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
    console.error('❌ Get items by restaurant error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch items"
    });
  }
};

module.exports = exports;