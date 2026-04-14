// ============================================
// ملف: src/controllers/store.controller.js (المعدل بالكامل)
// الوصف: التحكم الكامل في عمليات المتاجر (مطاعم، بقالات، صيدليات...)
// الإصدار: 1.0
// ============================================

const { Store, StoreAddress, Product, Review, Favorite, Order, User } = require('../models');
const cloudinary = require("../config/cloudinary");
const cache = require("../utils/cache.util");
const fileService = require('../services/file.service');
const PaginationUtils = require('../utils/pagination.util');
const QueryBuilder = require('../utils/queryBuilder.util');
const { AppError } = require('../middlewares/errorHandler.middleware');
const upload = require("../middlewares/upload");

// ========== 1. دوال البحث والتصفح العامة ==========

/**
 * @desc    الحصول على جميع المتاجر مع Pagination
 * @route   GET /api/v1/public/stores
 * @access  Public
 */
exports.getStoresPaginated = async (req, res) => {
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

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.tags) {
      // التحقق من نوع tags
      if (Array.isArray(filters.tags)) {
        query.tags = { $in: filters.tags };
      } else if (typeof filters.tags === 'string') {
        query.tags = { $in: filters.tags.split(',') };
      }
    }
    if (filters.minRating) {
      query.averageRating = { $gte: Number(filters.minRating) };
    }

    if (filters.city) {  // ✅ إضافة فلتر المدينة
      query['address.city'] = { $regex: filters.city, $options: 'i' };
    }

    if (filters.hasDelivery !== undefined) {  // ✅ تغيير منطق التوصيل
      query['deliveryInfo.hasDelivery'] = filters.hasDelivery === 'true';
    }

    const cacheKey = `stores:${JSON.stringify(query)}:${skip}:${limit}:${JSON.stringify(sort)}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log('📦 Serving paginated stores from cache');
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    console.log(`🔄 Fetching stores (page ${paginationOptions.page})`);

    const [stores, total] = await Promise.all([
      Store.find(query)
        .select('name logo coverImage description category averageRating ratingsCount deliveryInfo tags address isOpen')  // ✅ logo بدل image
        .populate('owner', 'name phone')  // ✅ owner بدل createdBy
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),

      Store.countDocuments(query)
    ]);

    const storesWithDetails = await Promise.all(
      stores.map(async (store) => {
        const productsCount = await Product.countDocuments({  // ✅ تغيير من Item
          store: store._id,  // ✅ store بدل store
          isAvailable: true
        });

        const addresses = await StoreAddress.find({  // ✅ StoreAddress
          store: store._id
        })
          .select('addressLine city latitude longitude label')
          .limit(3)
          .lean();

        let isFavorite = false;
        if (req.user) {
          isFavorite = await Favorite.isFavorite(req.user.id, store._id);
        }

        const optimizedImages = {};
        if (store.logo) {  // ✅ logo بدل image
          const publicId = fileService.extractPublicIdFromUrl(store.logo);
          if (publicId) {
            optimizedImages.thumbnail = fileService.getOptimizedUrl(publicId, 'thumbnail');
            optimizedImages.small = fileService.getOptimizedUrl(publicId, 'small');
            optimizedImages.medium = fileService.getOptimizedUrl(publicId, 'medium');
          }
        }

        return {
          ...store,
          addresses,
          productsCount,  // ✅ itemsCount -> productsCount
          isFavorite,
          logoOptimized: optimizedImages,  // ✅ تغيير الاسم
          stats: {
            productsCount,  // ✅ itemsCount -> productsCount
            addressesCount: addresses.length,
            reviewsCount: store.ratingsCount || 0
          }
        };
      })
    );

    const stats = {
      totalCount: await Store.countDocuments({ isOpen: true }),
      byCategory: await Store.aggregate([  // ✅ byType -> byCategory
        { $match: { isOpen: true } },
        { $group: { _id: "$category", count: { $sum: 1 } } }
      ]),
      averageRating: await Store.aggregate([
        { $match: { isOpen: true } },
        { $group: { _id: null, avg: { $avg: "$averageRating" } } }
      ])
    };

    const responseData = PaginationUtils.createPaginationResponse(
      storesWithDetails,
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
      message: 'فشل جلب المتاجر'
    });
  }
};

/**
 * @desc    البحث الذكي باستخدام QueryBuilder
 * @route   GET /api/v1/public/stores/smart
 * @access  Public
 */
exports.getStoresSmart = async (req, res) => {
  try {
    const builder = new QueryBuilder(Store, req.query);

    const { data, total } = await builder
      .filterIfExists('category')  // ✅ type -> category
      .filterIfExists('isOpen')
      .search(['name', 'description', 'tags'])
      .rangeFilter('averageRating', 'minRating', 'maxRating')
      .rangeFilter('deliveryInfo.deliveryFee', 'minFee', 'maxFee')  // ✅ تغيير المسار
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
 * @route   GET /api/v1/public/stores/search
 * @access  Public
 */
exports.searchStores = async (req, res) => {
  try {
    const { name, category, city, minRating } = req.query;  // ✅ type -> category
    const filter = { isOpen: true };

    if (name) {
      filter.name = { $regex: name, $options: "i" };
    }

    if (category) {  // ✅ type -> category
      filter.category = category;
    }

    if (minRating) {
      filter.averageRating = { $gte: Number(minRating) };
    }

    const stores = await Store.find(filter)
      .select('name logo description category averageRating deliveryInfo tags address')  // ✅ logo بدل image
      .populate("owner", "name phone")  // ✅ owner بدل createdBy
      .limit(20)
      .lean();

    let results = stores;
    if (city) {
      const storeIds = await StoreAddress.find({
        city: { $regex: city, $options: "i" }
      }).distinct('store');

      results = stores.filter(s =>
        storeIds.includes(s._id.toString())
      );
    }

    if (req.user) {
      const favorites = await Favorite.find({
        user: req.user.id,
        isActive: true
      });
      const favoriteIds = favorites.map(f => f.store.toString());  // ✅ store -> store

      results = results.map(store => ({
        ...store,
        isFavorite: favoriteIds.includes(store._id.toString())
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

// ========== 2. دوال تفاصيل المتجر ==========

/**
 * @desc    الحصول على تفاصيل متجر كاملة
 * @route   GET /api/v1/public/stores/:id
 * @access  Public
 */
exports.getStoreDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const cacheKey = `store:complete:${id}`;  // ✅ store -> store
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`🏪 Serving complete store ${id} from cache`);
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    console.log(`🔄 Fetching complete store ${id} from database`);

    const [
      store,
      addresses,
      reviews,
      products,
      categories,
      stats
    ] = await Promise.all([
      Store.findById(id)
        .populate('owner', 'name phone email')  // ✅ owner بدل createdBy
        .lean(),

      StoreAddress.find({ store: id })  // ✅ StoreAddress
        .select('addressLine city latitude longitude label isDefault')
        .lean(),

      Review.find({ store: id })  // ✅ store -> store
        .populate('user', 'name image')
        .select('rating comment createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      Product.find({ store: id, isAvailable: true })  // ✅ Item -> Product
        .select('name price image description category inventory attributes preparationTime')
        .sort({ category: 1, name: 1 })
        .lean(),

      Product.distinct('category', { store: id, isAvailable: true }),

      exports.getStoreStats(id)
    ]);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found'
      });
    }

    if (store.logo) {  // ✅ image -> logo
      const publicId = fileService.extractPublicIdFromUrl(store.logo);
      if (publicId) {
        store.logoOptimized = fileService.getAllSizes(publicId);  // ✅ تغيير الاسم
      }
    }

    let isFavorite = false;
    if (req.user) {
      isFavorite = await Favorite.isFavorite(req.user.id, id);
    }

    const reviewStats = await Review.aggregate([
      { $match: { store: id } },  // ✅ store -> store
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
        store: {
          ...store,
          stats: {
            productsCount: products.length,  // ✅ itemsCount -> productsCount
            addressesCount: addresses.length,
            reviewsCount: reviewStats[0]?.totalReviews || 0,
            averageRating: reviewStats[0]?.averageRating || 0,
            ratingDistribution,
            ...stats
          }
        },
        addresses,
        reviews,
        products,  // ✅ items -> products
        categories,
        isFavorite
      },
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 300);

    res.json(responseData);
  } catch (error) {
    console.error('❌ Get store details error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch store details'
    });
  }
};

/**
 * @desc    الحصول على منتجات المتجر
 * @route   GET /api/v1/public/stores/:id/products
 * @access  Public
 */
exports.getStoreProducts = async (req, res) => {  // ✅ getStoreItems -> getStoreProducts
  try {
    const { id } = req.params;
    const { category, minPrice, maxPrice, inStock } = req.query;

    const query = { store: id, isAvailable: true };  // ✅ store -> store

    if (category) {
      query.category = category;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (inStock === 'true') {
      query['inventory.quantity'] = { $gt: 0 };
    }

    const products = await Product.find(query)  // ✅ Item -> Product
      .select('name price discountedPrice image description category inventory attributes preparationTime')
      .sort({ category: 1, name: 1 })
      .lean();

    const groupedByCategory = products.reduce((acc, product) => {
      const cat = product.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(product);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        products,  // ✅ items -> products
        groupedByCategory,
        categories: Object.keys(groupedByCategory),
        total: products.length
      }
    });
  } catch (error) {
    console.error('❌ Get store products error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch store products'
    });
  }
};

// ========== 3. دوال التقييمات ==========

/**
 * @desc    إضافة تقييم لمتجر
 * @route   POST /api/v1/client/reviews/:storeId
 * @access  Authenticated (Client only)
 */
exports.addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const storeId = req.params.storeId;  // ✅ storeId -> storeId

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5"
      });
    }

    const existingReview = await Review.findOne({
      user: req.user.id,
      store: storeId  // ✅ store -> store
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You already rated this store"
      });
    }

    const hasOrdered = await Order.findOne({
      user: req.user.id,
      store: storeId,  // ✅ store -> store
      status: 'delivered'
    });

    if (!hasOrdered && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: "You can only review stores you've ordered from"
      });
    }

    const review = await Review.create({
      user: req.user.id,
      store: storeId,  // ✅ store -> store
      rating,
      comment: comment?.trim()
    });

    const stats = await Review.aggregate([
      { $match: { store: storeId } },  // ✅ store -> store
      {
        $group: {
          _id: "$store",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 }
        }
      }
    ]);

    await Store.findByIdAndUpdate(storeId, {
      averageRating: stats[0]?.avgRating || rating,
      ratingsCount: stats[0]?.count || 1
    });

    cache.del(`store:complete:${storeId}`);
    cache.invalidatePattern(`stores:*`);

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
        message: "You already rated this store"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to add review"
    });
  }
};

/**
 * @desc    الحصول على تقييمات متجر
 * @route   GET /api/v1/public/stores/:storeId/reviews
 * @access  Public
 */
exports.getStoreReviews = async (req, res) => {  // ✅ getStoreReviews -> getStoreReviews
  try {
    const storeId = req.params.storeId;  // ✅ storeId -> storeId
    const { page = 1, limit = 10, sort = "-createdAt" } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total] = await Promise.all([
      Review.find({ store: storeId })  // ✅ store -> store
        .populate("user", "name image")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),

      Review.countDocuments({ store: storeId })
    ]);

    const stats = await Review.aggregate([
      { $match: { store: storeId } },
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
    console.error("❌ Error in getStoreReviews:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reviews"
    });
  }
};

// ========== 4. دوال الإدارة (للمسؤول وللتاجر) ==========

/**
 * @desc    إنشاء متجر جديد
 * @route   POST /api/v1/admin/stores
 * @access  Admin
 */
exports.createStore = async (req, res) => {
  try {
    // 🔍 تسجيل البيانات الواردة للـ debugging
    console.log('📥 Request body:', req.body);
    console.log('📥 Request files:', req.files);
    console.log('📥 Request headers:', req.headers['content-type']);

    const {
      name, description, category, phone, email, website,
      deliveryFee, minOrderAmount, estimatedDeliveryTime, deliveryRadius,
      tags, openingHours, address
    } = req.body;

    console.log('📥 Extracted values:', {
      name,
      description,
      category,
      phone,
      email,
      website,
      address,
      deliveryInfo: { deliveryFee, minOrderAmount, estimatedDeliveryTime, deliveryRadius },
      tags
    });

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Store name is required"
      });
    }

    // ✅ معالجة التاغات - تأكد من أنها Array
    let tagsArray = [];
    if (tags) {
      if (Array.isArray(tags)) {
        tagsArray = tags;
      } else if (typeof tags === 'string') {
        tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      }
    }

    // ✅ معالجة ساعات العمل
    let openingHoursObj = {};
    if (openingHours) {
      if (typeof openingHours === 'object') {
        openingHoursObj = openingHours;
      } else if (typeof openingHours === 'string') {
        try {
          openingHoursObj = JSON.parse(openingHours);
        } catch (e) {
          console.warn('Failed to parse openingHours:', e.message);
        }
      }
    }

    // ✅ معالجة العنوان
    let addressObj = {};
    if (address) {
      if (typeof address === 'object') {
        addressObj = address;
      } else if (typeof address === 'string') {
        try {
          addressObj = JSON.parse(address);
        } catch (e) {
          console.warn('Failed to parse address:', e.message);
        }
      }
    }

    // ✅ معالجة معلومات التوصيل - تحقق من وجود deliveryInfo أو حقول منفردة
    let deliveryInfoObj = {};
    
    // إذا كان هناك deliveryInfo في req.body
    if (req.body.deliveryInfo) {
      if (typeof req.body.deliveryInfo === 'object') {
        deliveryInfoObj = req.body.deliveryInfo;
      } else if (typeof req.body.deliveryInfo === 'string') {
        try {
          deliveryInfoObj = JSON.parse(req.body.deliveryInfo);
        } catch (e) {
          console.warn('Failed to parse deliveryInfo:', e.message);
        }
      }
    }
    
    // إذا كانت الحقول المنفردة موجودة، استخدمها
    const hasDelivery = req.body.hasDelivery !== undefined 
      ? req.body.hasDelivery 
      : (deliveryInfoObj.hasDelivery !== undefined ? deliveryInfoObj.hasDelivery : true);
    
    const finalDeliveryInfo = {
      hasDelivery: hasDelivery,
      deliveryFee: Number(deliveryFee !== undefined ? deliveryFee : (deliveryInfoObj.deliveryFee || 0)),
      minOrderAmount: Number(minOrderAmount !== undefined ? minOrderAmount : (deliveryInfoObj.minOrderAmount || 0)),
      estimatedDeliveryTime: Number(estimatedDeliveryTime !== undefined ? estimatedDeliveryTime : (deliveryInfoObj.estimatedDeliveryTime || 30)),
      deliveryRadius: Number(deliveryRadius !== undefined ? deliveryRadius : (deliveryInfoObj.deliveryRadius || 10)),
      freeDeliveryThreshold: Number(req.body.freeDeliveryThreshold !== undefined ? req.body.freeDeliveryThreshold : (deliveryInfoObj.freeDeliveryThreshold || 0))
    };

    // ✅ إنشاء المتجر
    const store = await Store.create({
      name: name.trim(),
      description: description?.trim(),
      category: category || "store",
      phone: phone?.trim(),
      email: email?.trim(),
      website: website?.trim(),
      logo: req.files?.logo ? req.files.logo[0].path : null,
      coverImage: req.files?.coverImage ? req.files.coverImage[0].path : null,
      address: addressObj,
      deliveryInfo: finalDeliveryInfo,
      tags: tagsArray,
      openingHours: openingHoursObj,
      owner: req.user.id,
      isOpen: req.body.isOpen === true || req.body.isOpen === 'true' || true,
      isVerified: req.user.role === 'admin'
    });

    const optimizedImages = {};
    if (store.logo) {
      const publicId = fileService.extractPublicIdFromUrl(store.logo);
      if (publicId) {
        optimizedImages.thumbnail = fileService.getOptimizedUrl(publicId, 'thumbnail');
        optimizedImages.medium = fileService.getOptimizedUrl(publicId, 'medium');
      }
    }

    cache.invalidatePattern('stores:*');
    cache.invalidatePattern('home:*');

    await store.populate("owner", "name email phone");

    res.status(201).json({
      success: true,
      message: "Store created successfully",
      data: {
        ...store.toObject(),
        logoOptimized: optimizedImages
      }
    });
  } catch (error) {
    console.error("❌ Error in createStore:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create store",
      error: error.message
    });
  }
};

/**
 * @desc    تحديث بيانات المتجر
 * @route   PUT /api/v1/vendor/store  (للتاجر)
 * @route   PUT /api/v1/admin/stores/:id (للمسؤول)
 * @access  Vendor / Admin
 */
exports.updateStore = async (req, res) => {  // ✅ updateStore -> updateStore
  try {
    const storeId = req.params.id || req.storeId;  // دعم لكل من المسؤول والتاجر
    const updates = req.body;

    // الحقول المسموح بتحديثها
    const allowedUpdates = [
      'name', 'description', 'category', 'phone', 'email', 'website',
      'address', 'deliveryInfo', 'tags', 'openingHours', 'isOpen'
    ];

    const updateData = {};
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        if (key === 'tags' && typeof updates[key] === 'string') {
          updateData[key] = updates[key].split(',').map(tag => tag.trim()).filter(tag => tag);
        } else if (key === 'address' && typeof updates[key] === 'string') {
          try {
            updateData[key] = JSON.parse(updates[key]);
          } catch (e) {
            updateData[key] = updates[key];
          }
        } else if (key === 'deliveryInfo' && typeof updates[key] === 'string') {
          try {
            updateData[key] = JSON.parse(updates[key]);
          } catch (e) {
            updateData[key] = updates[key];
          }
        } else {
          updateData[key] = updates[key];
        }
      }
    });

    const store = await Store.findByIdAndUpdate(
      storeId,
      updateData,
      { returnDocument: 'after', runValidators: true }
    );

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store not found"
      });
    }

    cache.del(`store:complete:${storeId}`);
    cache.invalidatePattern('stores:*');
    cache.invalidatePattern('home:*');

    res.json({
      success: true,
      message: "Store updated successfully",
      data: store,
      updatedFields: Object.keys(updateData)
    });
  } catch (error) {
    console.error("❌ Error in updateStore:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update store"
    });
  }
};

/**
 * @desc    تحديث شعار المتجر
 * @route   PUT /api/v1/vendor/store/logo
 * @access  Vendor
 */
exports.updateStoreLogo = async (req, res) => {  // ✅ updateCoverImage -> updateStoreLogo
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded"
      });
    }

    const storeId = req.storeId;

    const oldStore = await Store.findById(storeId).select('logo');
    if (oldStore?.logo) {
      const oldPublicId = fileService.extractPublicIdFromUrl(oldStore.logo);
      if (oldPublicId) {
        fileService.deleteFile(oldPublicId).catch(err =>
          console.error('Error deleting old logo:', err)
        );
      }
    }

    const store = await Store.findByIdAndUpdate(
      storeId,
      { logo: req.file.path },
      { new: true }
    );

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store not found"
      });
    }

    cache.del(`store:complete:${storeId}`);
    cache.invalidatePattern('stores:*');

    res.json({
      success: true,
      message: "Store logo updated successfully",
      data: {
        logo: store.logo,
        optimized: req.file.thumbnail || null
      }
    });
  } catch (error) {
    console.error("❌ Error in updateStoreLogo:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update store logo"
    });
  }
};

/**
 * @desc    تحديث صورة الغلاف
 * @route   PUT /api/v1/vendor/store/cover
 * @access  Vendor
 */
exports.updateStoreCover = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded"
      });
    }

    const storeId = req.storeId;

    const oldStore = await Store.findById(storeId).select('coverImage');
    if (oldStore?.coverImage) {
      const oldPublicId = fileService.extractPublicIdFromUrl(oldStore.coverImage);
      if (oldPublicId) {
        fileService.deleteFile(oldPublicId).catch(err =>
          console.error('Error deleting old cover:', err)
        );
      }
    }

    const store = await Store.findByIdAndUpdate(
      storeId,
      { coverImage: req.file.path },
      { new: true }
    );

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store not found"
      });
    }

    cache.del(`store:complete:${storeId}`);
    cache.invalidatePattern('stores:*');

    res.json({
      success: true,
      message: "Cover image updated successfully",
      data: {
        coverImage: store.coverImage,
        optimized: req.file.thumbnail || null
      }
    });
  } catch (error) {
    console.error("❌ Error in updateStoreCover:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update cover image"
    });
  }
};

/**
 * @desc    حذف متجر
 * @route   DELETE /api/v1/admin/stores/:id
 * @access  Admin
 */
exports.deleteStore = async (req, res) => {  // ✅ deleteStore -> deleteStore
  try {
    const storeId = req.params.id;

    const store = await Store.findById(storeId);
    if (store) {
      if (store.logo) {
        const publicId = fileService.extractPublicIdFromUrl(store.logo);
        if (publicId) fileService.deleteFile(publicId);
      }
      if (store.coverImage) {
        const publicId = fileService.extractPublicIdFromUrl(store.coverImage);
        if (publicId) fileService.deleteFile(publicId);
      }
    }

    await Store.findByIdAndDelete(storeId);

    cache.invalidatePattern('stores:*');
    cache.invalidatePattern('home:*');
    cache.del(`store:complete:${storeId}`);

    res.json({
      success: true,
      message: "Store deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error in deleteStore:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete store"
    });
  }
};

/**
 * @desc    تحديث حالة المتجر (مفتوح/مغلق)
 * @route   PUT /api/v1/vendor/store/toggle-status
 * @access  Vendor
 */
exports.toggleStoreStatus = async (req, res) => {  // ✅ toggleStoreStatus -> toggleStoreStatus
  try {
    const storeId = req.storeId;

    const store = await Store.findById(storeId);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store not found"
      });
    }

    store.isOpen = !store.isOpen;
    await store.save();

    cache.del(`store:complete:${storeId}`);
    cache.invalidatePattern('stores:*');

    res.json({
      success: true,
      message: store.isOpen ? "Store is now open" : "Store is now closed",
      data: {
        isOpen: store.isOpen,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error("❌ Error in toggleStoreStatus:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle store status"
    });
  }
};

/**
 * @desc    توثيق متجر
 * @route   PUT /api/v1/admin/stores/:id/verify
 * @access  Admin
 */
exports.verifyStore = async (req, res) => {  // ✅ دالة جديدة
  try {
    const storeId = req.params.id;

    const store = await Store.findByIdAndUpdate(
      storeId,
      { isVerified: true },
      { new: true }
    );

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store not found"
      });
    }

    cache.del(`store:complete:${storeId}`);
    cache.invalidatePattern('stores:*');

    res.json({
      success: true,
      message: "Store verified successfully",
      data: { isVerified: store.isVerified }
    });
  } catch (error) {
    console.error("❌ Error in verifyStore:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify store"
    });
  }
};

// ========== 5. دوال إحصائية ==========

/**
 * @desc    الحصول على إحصائيات المتجر
 * @access  Internal
 */
exports.getStoreStats = async (storeId) => {  // ✅ getStoreStats -> getStoreStats
  try {
    const [
      productsCount,  // ✅ itemsCount -> productsCount
      reviewsCount,
      ordersCount,
      ratingDistribution,
      popularProducts  // ✅ popularItems -> popularProducts
    ] = await Promise.all([
      Product.countDocuments({ store: storeId, isAvailable: true }),

      Review.countDocuments({ store: storeId }),

      Order.countDocuments({ store: storeId, status: 'delivered' }),

      Review.aggregate([
        { $match: { store: storeId } },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      Order.aggregate([
        { $match: { store: storeId, status: 'delivered' } },
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
      products: productsCount,  // ✅ items -> products
      reviews: reviewsCount,
      orders: ordersCount,
      ratingDistribution: ratingDistribution.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      popularProducts,  // ✅ popularItems -> popularProducts
      lastUpdated: new Date()
    };
  } catch (error) {
    console.error("❌ Error in getStoreStats:", error);
    return {
      products: 0,
      reviews: 0,
      orders: 0,
      ratingDistribution: {},
      popularProducts: []
    };
  }
};

/**
 * @desc    Middleware لرفع ملفات المتجر
 */
exports.uploadStoreFiles = (req, res, next) => {  // ✅ uploadStoreFiles -> uploadStoreFiles
  const uploadFields = upload("stores").fields([
    { name: "logo", maxCount: 1 },  // ✅ image -> logo
    { name: "coverImage", maxCount: 1 },
    { name: "productImages", maxCount: 20 }  // ✅ itemImages -> productImages
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


/**
 * @desc    بحث متقدم مع Pagination
 * @route   GET /api/v1/public/stores/search/advanced
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

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.minRating) {
      query.averageRating = { $gte: Number(filters.minRating) };
    }

    if (filters.tags) {
      // التحقق من نوع tags
      if (Array.isArray(filters.tags)) {
        query.tags = { $in: filters.tags };
      } else if (typeof filters.tags === 'string') {
        query.tags = { $in: filters.tags.split(',') };
      }
    }
    if (filters.city) {
      query['address.city'] = { $regex: filters.city, $options: 'i' };
    }

    if (filters.hasDelivery !== undefined) {
      query['deliveryInfo.hasDelivery'] = filters.hasDelivery === 'true';
    }

    if (filters.minFee || filters.maxFee) {
      query['deliveryInfo.deliveryFee'] = {};
      if (filters.minFee) query['deliveryInfo.deliveryFee'].$gte = Number(filters.minFee);
      if (filters.maxFee) query['deliveryInfo.deliveryFee'].$lte = Number(filters.maxFee);
    }

    const [stores, total] = await Promise.all([
      Store.find(query)
        .select('name logo description category averageRating deliveryInfo tags address')
        .populate('owner', 'name phone')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),

      Store.countDocuments(query)
    ]);

    const response = PaginationUtils.createPaginationResponse(
      stores,
      total,
      paginationOptions
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

// ========== 6. دوال إضافية ==========

/**
 * @desc    تحديث إحداثيات المتاجر القديمة
 * @route   POST /api/v1/admin/stores/update-coordinates
 * @access  Admin
 */
exports.updateStoreCoordinates = async (req, res) => {
  try {
    // جلب جميع المتاجر التي ليس لها إحداثيات أو location
    const stores = await Store.find({
      $or: [
        { 'address.latitude': { $exists: false } },
        { 'address.latitude': null },
        { 'address.latitude': 0 },
        { 'location.coordinates': { $size: 0 } }
      ]
    });

    let updatedCount = 0;
    const results = [];

    for (const store of stores) {
      let lat = null;
      let lng = null;
      
      // محاولة استخراج الإحداثيات من address
      if (store.address) {
        lat = store.address.latitude;
        lng = store.address.longitude;
      }
      
      // إذا لم تكن هناك إحداثيات، استخدم إحداثيات افتراضية حسب المدينة
      if (!lat || !lng) {
        const city = store.address?.city?.toLowerCase() || '';
        
        // إحداثيات افتراضية للمدن الرئيسية
        const cityCoordinates = {
          'نيامي': [13.5126, 2.1098],
          'niamey': [13.5126, 2.1098],
          'الرياض': [24.7136, 46.6753],
          'riyadh': [24.7136, 46.6753],
          'جدة': [21.4858, 39.1925],
          'jeddah': [21.4858, 39.1925],
          'مكة': [21.3891, 39.8579],
          'mecca': [21.3891, 39.8579],
          'المدينة': [24.5247, 39.5692],
          'medina': [24.5247, 39.5692],
        };
        
        if (cityCoordinates[city]) {
          [lat, lng] = cityCoordinates[city];
        } else {
          // إحداثيات افتراضية
          lat = 13.5126;
          lng = 2.1098;
        }
      }
      
      // تحديث المتجر
      if (lat && lng) {
        store.address = {
          ...store.address,
          latitude: lat,
          longitude: lng
        };
        
        store.location = {
          type: 'Point',
          coordinates: [lng, lat]
        };
        
        await store.save();
        updatedCount++;
        results.push({
          id: store._id,
          name: store.name,
          latitude: lat,
          longitude: lng
        });
        
        console.log(`✅ Updated store ${store.name}: [${lng}, ${lat}]`);
      }
    }
    
    res.json({
      success: true,
      message: `تم تحديث ${updatedCount} متجر بنجاح`,
      data: {
        updatedCount,
        results
      }
    });
  } catch (error) {
    console.error('❌ Error updating store coordinates:', error);
    res.status(500).json({
      success: false,
      message: 'فشل تحديث إحداثيات المتاجر',
      error: error.message
    });
  }
};

/**
 * @desc    البحث عن المتاجر القريبة
 * @route   GET /api/v1/public/stores/nearby
 * @access  Public
 */
exports.getNearbyStores = async (req, res) => {
  try {
    const { lat, lng, radius = 5000, limit = 20 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'يجب توفير خط العرض وخط الطول'
      });
    }
    
    const stores = await Store.find({
      isOpen: true,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    })
    .select('name logo description category averageRating deliveryInfo address location')
    .limit(parseInt(limit))
    .lean();
    
    // حساب المسافة لكل متجر
    const storesWithDistance = stores.map(store => {
      let distance = null;
      if (store.location && store.location.coordinates) {
        const R = 6371; // نصف قطر الأرض بالكيلومتر
        const dLat = (store.location.coordinates[1] - parseFloat(lat)) * Math.PI / 180;
        const dLon = (store.location.coordinates[0] - parseFloat(lng)) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(parseFloat(lat) * Math.PI / 180) * Math.cos(store.location.coordinates[1] * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distance = R * c;
      }
      
      return {
        ...store,
        distance: distance ? distance.toFixed(1) : null
      };
    });
    
    res.json({
      success: true,
      data: storesWithDistance,
      count: storesWithDistance.length
    });
  } catch (error) {
    console.error('❌ Error getting nearby stores:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب المتاجر القريبة'
    });
  }
};

module.exports = exports;