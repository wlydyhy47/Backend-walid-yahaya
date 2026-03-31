// ============================================
// ملف: src/controllers/product.controller.js (جديد)
// الوصف: إدارة المنتجات لجميع أنواع المتاجر
// الإصدار: 1.0
// ============================================

const { Product, Store, Order } = require('../models');
const cache = require("../utils/cache.util");
const fileService = require('../services/file.service');
const PaginationUtils = require('../utils/pagination.util');
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة ==========

/**
 * إبطال كاش المنتجات
 */
const invalidateProductCache = (storeId, productId = null) => {
  cache.invalidatePattern('products:*');
  if (storeId) {
    cache.del(`store:complete:${storeId}`);
    cache.invalidatePattern(`stores:*`);
  }
  if (productId) {
    cache.del(`product:${productId}`);
  }
};

/**
 * التحقق من وجود المتجر
 */
const validateStore = async (storeId, userId = null) => {
  const store = await Store.findById(storeId);
  if (!store) {
    throw new AppError('المتجر غير موجود', 404);
  }

  // إذا كان هناك userId، تحقق من الملكية
  if (userId && store.owner?.toString() !== userId) {
    throw new AppError('غير مصرح لك بإدارة منتجات هذا المتجر', 403);
  }

  return store;
};

// ========== 2. دوال البحث والعرض العامة ==========

/**
 * @desc    الحصول على جميع المنتجات (للمشرفين)
 * @route   GET /api/v1/admin/products
 * @access  Admin
 */
exports.getAllProducts = async (req, res) => {
  try {
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, search, filters } = paginationOptions;

    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.store) {
      query.store = filters.store;
    }

    if (filters.minPrice || filters.maxPrice) {
      query.price = {};
      if (filters.minPrice) query.price.$gte = Number(filters.minPrice);
      if (filters.maxPrice) query.price.$lte = Number(filters.maxPrice);
    }

    if (filters.isAvailable !== undefined) {
      query.isAvailable = filters.isAvailable === 'true';
    }

    if (filters.inStock === 'true') {
      query['inventory.quantity'] = { $gt: 0 };
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('store', 'name logo category owner')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),

      Product.countDocuments(query)
    ]);

    // إحصائيات
    const stats = {
      totalProducts: await Product.countDocuments(),
      byCategory: await Product.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } }
      ]),
      outOfStock: await Product.countDocuments({ 'inventory.quantity': { $lte: 0 } }),
      avgPrice: await Product.aggregate([
        { $group: { _id: null, avg: { $avg: "$price" } } }
      ])
    };

    const response = PaginationUtils.createPaginationResponse(
      products,
      total,
      paginationOptions,
      { stats }
    );

    res.json(response);
  } catch (error) {
    console.error("❌ Get all products error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch products"
    });
  }
};

/**
 * @desc    الحصول على منتجات التاجر
 * @route   GET /api/v1/vendor/products
 * @access  Vendor
 */
exports.getVendorProducts = async (req, res) => {
  try {
    const storeId = req.storeId;
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;

    const query = { store: storeId };

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.isAvailable !== undefined) {
      query.isAvailable = filters.isAvailable === 'true';
    }

    if (filters.inStock === 'true') {
      query['inventory.quantity'] = { $gt: 0 };
    }

    if (filters.minPrice || filters.maxPrice) {
      query.price = {};
      if (filters.minPrice) query.price.$gte = Number(filters.minPrice);
      if (filters.maxPrice) query.price.$lte = Number(filters.maxPrice);
    }

    const cacheKey = `vendor:products:${storeId}:${JSON.stringify(query)}:${skip}:${limit}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),

      Product.countDocuments(query)
    ]);

    // إحصائيات سريعة
    const stats = {
      totalProducts: await Product.countDocuments({ store: storeId }),
      availableProducts: await Product.countDocuments({ store: storeId, isAvailable: true }),
      outOfStock: await Product.countDocuments({
        store: storeId,
        'inventory.quantity': { $lte: 0 }
      }),
      categories: await Product.distinct('category', { store: storeId }),
      lowStock: await Product.countDocuments({
        store: storeId,
        $expr: { $lte: ["$inventory.quantity", "$inventory.lowStockThreshold"] }
      })
    };

    const response = PaginationUtils.createPaginationResponse(
      products,
      total,
      paginationOptions,
      { stats }
    );

    cache.set(cacheKey, response, 120); // دقيقتان

    res.json(response);
  } catch (error) {
    console.error("❌ Get vendor products error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch products"
    });
  }
};

/**
 * @desc    الحصول على منتج محدد
 * @route   GET /api/v1/public/products/:id
 * @access  Public
 */
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const cacheKey = `product:${id}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const product = await Product.findById(id)
      .populate('store', 'name logo category deliveryInfo address rating')
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // زيادة عدد المشاهدات
    await Product.findByIdAndUpdate(id, {
      $inc: { 'stats.views': 1 }
    });

    // منتجات مشابهة
    const similarProducts = await Product.find({
      store: product.store._id,
      category: product.category,
      _id: { $ne: id },
      isAvailable: true
    })
      .select('name price image description')
      .limit(6)
      .lean();

    // صور محسنة
    const optimizedImages = {};
    if (product.image) {
      const publicId = fileService.extractPublicIdFromUrl(product.image);
      if (publicId) {
        optimizedImages.thumbnail = fileService.getOptimizedUrl(publicId, 'thumbnail');
        optimizedImages.small = fileService.getOptimizedUrl(publicId, 'small');
        optimizedImages.medium = fileService.getOptimizedUrl(publicId, 'medium');
      }
    }

    const responseData = {
      ...product,
      optimizedImages,
      similarProducts,
      stats: {
        ...product.stats,
        views: (product.stats?.views || 0) + 1
      }
    };

    cache.set(cacheKey, responseData, 300); // 5 دقائق

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("❌ Get product error:", error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to fetch product"
    });
  }
};

// ========== 3. دوال إدارة المنتجات (للتاجر) ==========


/**
 * @desc    إنشاء منتج جديد (للمشرف والتاجر)
 * @route   POST /api/v1/admin/products (للمشرف)
 * @route   POST /api/v1/vendor/products (للتاجر)
 * @access  Admin / Vendor
 */
exports.createProduct = async (req, res) => {
  try {
    // تحديد storeId من مصادر مختلفة
    // 1. من middleware للتاجر (req.storeId)
    // 2. من body للمشرف (req.body.store أو req.body.storeId)
    let storeId = req.storeId || req.body.store || req.body.storeId;
    
    // التحقق من وجود storeId
    if (!storeId) {
      return res.status(400).json({
        success: false,
        message: "معرف المتجر مطلوب. يرجى اختيار متجر للمنتج."
      });
    }

    const {
      name,
      price,
      discountedPrice,
      description,
      category,
      inventory,
      attributes,
      preparationTime,
      ingredients,
      nutritionalInfo,
      options,
      tags
    } = req.body;

    // التحقق من البيانات المطلوبة
    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: "اسم المنتج والسعر مطلوبان"
      });
    }

    // التحقق من وجود المتجر
    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).json({
        success: false,
        message: "المتجر غير موجود"
      });
    }
    
    // فقط للتاجر: تحقق من ملكية المتجر
    if (req.user.role === 'vendor' && store.owner?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بإدارة منتجات هذا المتجر"
      });
    }

    // معالجة البيانات JSON
    let inventoryObj = { quantity: 0, unit: 'piece', lowStockThreshold: 5, trackInventory: false };
    try {
      if (inventory) inventoryObj = typeof inventory === 'string' ? JSON.parse(inventory) : inventory;
    } catch (e) { }

    let attributesObj = {};
    try {
      if (attributes) attributesObj = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;
    } catch (e) { }

    let nutritionalInfoObj = {};
    try {
      if (nutritionalInfo) nutritionalInfoObj = typeof nutritionalInfo === 'string' ? JSON.parse(nutritionalInfo) : nutritionalInfo;
    } catch (e) { }

    let optionsArray = [];
    try {
      if (options) optionsArray = typeof options === 'string' ? JSON.parse(options) : options;
    } catch (e) { }

    let ingredientsArray = [];
    if (ingredients) {
      ingredientsArray = Array.isArray(ingredients) 
        ? ingredients 
        : ingredients.split(',').map(i => i.trim()).filter(i => i);
    }

    let tagsArray = [];
    if (tags) {
      tagsArray = Array.isArray(tags) 
        ? tags 
        : tags.split(',').map(t => t.trim()).filter(t => t);
    }

    // إنشاء المنتج
    const product = await Product.create({
      name: name.trim(),
      price: Number(price),
      discountedPrice: discountedPrice ? Number(discountedPrice) : null,
      store: storeId,
      image: req.file ? req.file.path : null,
      description: description?.trim(),
      category: category || 'other',
      inventory: inventoryObj,
      attributes: attributesObj,
      preparationTime: preparationTime ? Number(preparationTime) : 15,
      ingredients: ingredientsArray,
      nutritionalInfo: nutritionalInfoObj,
      options: optionsArray,
      tags: tagsArray,
      isAvailable: true,
      stats: { views: 0, orders: 0, revenue: 0 }
    });

    // تحديث إحصائيات المتجر
    await Store.findByIdAndUpdate(storeId, {
      $inc: { 'stats.totalProducts': 1 }
    });

    // إبطال الكاش
    invalidateProductCache(storeId);

    // صور محسنة
    const optimizedImages = {};
    if (product.image) {
      const publicId = fileService.extractPublicIdFromUrl(product.image);
      if (publicId) {
        optimizedImages.thumbnail = fileService.getOptimizedUrl(publicId, 'thumbnail');
        optimizedImages.small = fileService.getOptimizedUrl(publicId, 'small');
      }
    }

    res.status(201).json({
      success: true,
      message: "تم إنشاء المنتج بنجاح",
      data: {
        ...product.toObject(),
        optimizedImages
      }
    });

    console.log('📸 File upload check:', {
    hasFile: !!req.file,
    filePath: req.file?.path,
    fileCloudinary: req.file?.cloudinary?.url,
    contentType: req.headers['content-type'],
    bodyKeys: Object.keys(req.body)
  });
    
  } catch (error) {
    console.error("❌ Create product error:", error);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل في إنشاء المنتج",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


/**
 * @desc    تحديث منتج
 * @route   PUT /api/v1/vendor/products/:id
 * @access  Vendor
 */
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const storeId = req.storeId;
    const updates = req.body;

    const product = await Product.findOne({ _id: id, store: storeId });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or you don't have permission"
      });
    }

    // الحقول المسموح بتحديثها
    const allowedUpdates = [
      'name', 'price', 'discountedPrice', 'description', 'category',
      'inventory', 'attributes', 'preparationTime', 'ingredients',
      'nutritionalInfo', 'options', 'tags', 'isAvailable'
    ];

    // تحديث الحقول
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        if (field === 'ingredients' && typeof updates[field] === 'string') {
          product[field] = updates[field].split(',').map(i => i.trim()).filter(i => i);
        } else if (field === 'tags' && typeof updates[field] === 'string') {
          product[field] = updates[field].split(',').map(t => t.trim()).filter(t => t);
        } else if (field === 'inventory' && typeof updates[field] === 'string') {
          try {
            product[field] = JSON.parse(updates[field]);
          } catch (e) {
            product[field] = updates[field];
          }
        } else if (field === 'attributes' && typeof updates[field] === 'string') {
          try {
            product[field] = JSON.parse(updates[field]);
          } catch (e) {
            product[field] = updates[field];
          }
        } else if (field === 'nutritionalInfo' && typeof updates[field] === 'string') {
          try {
            product[field] = JSON.parse(updates[field]);
          } catch (e) {
            product[field] = updates[field];
          }
        } else if (field === 'options' && typeof updates[field] === 'string') {
          try {
            product[field] = JSON.parse(updates[field]);
          } catch (e) {
            product[field] = updates[field];
          }
        } else {
          product[field] = updates[field];
        }
      }
    });

    await product.save();

    // إبطال الكاش
    invalidateProductCache(storeId, id);

    res.json({
      success: true,
      message: "Product updated successfully",
      data: product,
      updatedFields: Object.keys(updates).filter(f => allowedUpdates.includes(f))
    });
  } catch (error) {
    console.error("❌ Update product error:", error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update product"
    });
  }
};

/**
 * @desc    تحديث صورة المنتج
 * @route   PUT /api/v1/vendor/products/:id/image
 * @access  Vendor
 */
exports.updateProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    const storeId = req.storeId;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded"
      });
    }

    const product = await Product.findOne({ _id: id, store: storeId });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // حذف الصورة القديمة
    if (product.image) {
      const oldPublicId = fileService.extractPublicIdFromUrl(product.image);
      if (oldPublicId) {
        fileService.deleteFile(oldPublicId).catch(err =>
          console.error('Error deleting old product image:', err)
        );
      }
    }

    // تحديث الصورة
    product.image = req.file.path;
    await product.save();

    // إبطال الكاش
    invalidateProductCache(storeId, id);

    // صور محسنة
    const optimizedImages = {};
    if (product.image) {
      const publicId = fileService.extractPublicIdFromUrl(product.image);
      if (publicId) {
        optimizedImages.thumbnail = fileService.getOptimizedUrl(publicId, 'thumbnail');
        optimizedImages.small = fileService.getOptimizedUrl(publicId, 'small');
        optimizedImages.medium = fileService.getOptimizedUrl(publicId, 'medium');
      }
    }

    res.json({
      success: true,
      message: "Product image updated successfully",
      data: {
        id: product._id,
        image: product.image,
        optimizedImages
      }
    });
  } catch (error) {
    console.error("❌ Update product image error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update product image"
    });
  }
};

/**
 * @desc    حذف منتج (للمشرف أو التاجر)
 * @route   DELETE /api/v1/admin/products/:id (Admin)
 * @route   DELETE /api/v1/vendor/products/:id (Vendor)
 * @access  Admin / Vendor
 */
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    console.log('Delete product request:', {
      id,
      userId,
      userRole,
      storeId: req.storeId
    });
    
    // التحقق من صحة الـ ID
    if (!id || id.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'معرف المنتج غير صالح'
      });
    }
    
    // البحث عن المنتج
    const product = await Product.findById(id).populate('store', 'owner');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'المنتج غير موجود'
      });
    }
    
    // التحقق من الصلاحيات
    if (userRole === 'vendor') {
      // للتاجر: تحقق من ملكية المتجر
      if (!req.storeId || product.store._id.toString() !== req.storeId) {
        return res.status(403).json({
          success: false,
          message: 'غير مصرح لك بحذف هذا المنتج'
        });
      }
    }
    // للمشرف: لا حاجة للتحقق، يمكنه حذف أي منتج
    
    console.log('Found product to delete:', {
      id: product._id,
      name: product.name,
      store: product.store._id,
      role: userRole
    });
    
    // حذف الصورة من Cloudinary
    if (product.image) {
      try {
        const publicId = fileService.extractPublicIdFromUrl(product.image);
        if (publicId) {
          await fileService.deleteFile(publicId);
          console.log('Deleted product image:', publicId);
        }
      } catch (imgError) {
        console.error('Error deleting product image:', imgError);
      }
    }
    
    // حذف المنتج
    await Product.findByIdAndDelete(id);
    
    // تحديث إحصائيات المتجر
    await Store.findByIdAndUpdate(product.store._id, {
      $inc: { 'stats.totalProducts': -1 }
    });
    
    // إبطال الكاش
    invalidateProductCache(product.store._id, id);
    
    console.log('Product deleted successfully:', id);
    
    res.json({
      success: true,
      message: 'تم حذف المنتج بنجاح',
      data: {
        id: product._id,
        name: product.name
      }
    });
    
  } catch (error) {
    console.error('❌ Delete product error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'معرف المنتج غير صالح'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'فشل في حذف المنتج',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    تبديل حالة التوفر
 * @route   PUT /api/v1/vendor/products/:id/toggle-availability
 * @access  Vendor
 */
exports.toggleAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const storeId = req.storeId;

    const product = await Product.findOne({ _id: id, store: storeId });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    product.isAvailable = !product.isAvailable;
    await product.save();

    // إبطال الكاش
    invalidateProductCache(storeId, id);

    res.json({
      success: true,
      message: `Product is now ${product.isAvailable ? 'available' : 'unavailable'}`,
      data: {
        id: product._id,
        isAvailable: product.isAvailable
      }
    });
  } catch (error) {
    console.error("❌ Toggle availability error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle availability"
    });
  }
};

/**
 * @desc    تحديث المخزون
 * @route   PUT /api/v1/vendor/products/:id/inventory
 * @access  Vendor
 */
exports.updateInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const storeId = req.storeId;
    const { quantity, unit, lowStockThreshold, trackInventory } = req.body;

    const product = await Product.findOne({ _id: id, store: storeId });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // تحديث المخزون
    if (quantity !== undefined) product.inventory.quantity = Number(quantity);
    if (unit) product.inventory.unit = unit;
    if (lowStockThreshold !== undefined) product.inventory.lowStockThreshold = Number(lowStockThreshold);
    if (trackInventory !== undefined) product.inventory.trackInventory = trackInventory;

    await product.save();

    // إبطال الكاش
    invalidateProductCache(storeId, id);

    res.json({
      success: true,
      message: "Inventory updated successfully",
      data: {
        id: product._id,
        inventory: product.inventory,
        isLowStock: product.inventory.quantity <= product.inventory.lowStockThreshold
      }
    });
  } catch (error) {
    console.error("❌ Update inventory error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update inventory"
    });
  }
};

// ========== 4. دوال للمشرفين ==========

/**
 * @desc    تمييز منتج كمميز
 * @route   PUT /api/v1/admin/products/:id/feature
 * @access  Admin
 */
exports.toggleFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const { featured } = req.body;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // يمكن إضافة حقل featured في المستقبل
    // product.featured = featured;

    await product.save();

    // إبطال الكاش
    invalidateProductCache(product.store, id);

    res.json({
      success: true,
      message: `Product ${featured ? 'featured' : 'unfeatured'} successfully`,
      data: { id: product._id, featured }
    });
  } catch (error) {
    console.error("❌ Toggle featured error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle featured"
    });
  }
};

// ========== 5. دوال إحصائية ==========

/**
 * @desc    الحصول على إحصائيات المنتجات للتاجر
 * @route   GET /api/v1/vendor/products/stats
 * @access  Vendor
 */
exports.getProductStats = async (req, res) => {
  try {
    const storeId = req.storeId;

    const [
      totalProducts,
      byCategory,
      topSelling,
      lowStock,
      outOfStock,
      monthlyStats
    ] = await Promise.all([
      // إجمالي المنتجات
      Product.countDocuments({ store: storeId }),

      // المنتجات حسب الفئة
      Product.aggregate([
        { $match: { store: storeId } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // الأكثر مبيعاً
      Order.aggregate([
        { $match: { store: storeId, status: 'delivered' } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            totalSold: { $sum: "$items.qty" },
            revenue: { $sum: { $multiply: ["$items.price", "$items.qty"] } }
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 }
      ]),

      // المنتجات منخفضة المخزون
      Product.countDocuments({
        store: storeId,
        $expr: { $lte: ["$inventory.quantity", "$inventory.lowStockThreshold"] }
      }),

      // المنتجات نفذت من المخزون
      Product.countDocuments({
        store: storeId,
        'inventory.quantity': { $lte: 0 }
      }),

      // إحصائيات شهرية
      Product.aggregate([
        { $match: { store: storeId } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m", date: "$createdAt" }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 6 }
      ])
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          total: totalProducts,
          lowStock,
          outOfStock,
          inStock: totalProducts - outOfStock
        },
        byCategory,
        topSelling,
        monthlyStats
      }
    });
  } catch (error) {
    console.error("❌ Get product stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get product statistics"
    });
  }
};

module.exports = exports;