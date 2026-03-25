// ============================================
// ملف: src/controllers/aggregate.controller.js
// الوصف: التحكم في عمليات التجميع والتحليلات
// الإصدار: 3.0 (مصحح - استخدام Product بدلاً من )
// ============================================
const { User, Address, Order, Store, StoreAddress, Review, Product, DriverLocation, Notification } = require('../models');
const cache = require('../utils/cache.util');
const PaginationUtils = require('../utils/pagination.util');

/**
 * 1️⃣ بيانات لوحة تحكم المستخدم مع الكاش
 * GET /api/aggregate/dashboard
 */
exports.getDashboardData = async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `dashboard:${userId}`;

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log('📊 Serving dashboard from cache');
      return res.json({
        ...cachedData,
        cached: true,
        timestamp: new Date()
      });
    }

    console.log('🔄 Fetching dashboard from database');

    const [
      user,
      addresses,
      orders,
      stores,
      reviews,
      unreadNotifications
    ] = await Promise.all([
      User.findById(userId)
        .select('name phone role image email stats isVerified lastLogin')
        .lean(),

      Address.find({ user: userId })
        .select('label addressLine city isDefault')
        .sort({ isDefault: -1, createdAt: -1 })
        .limit(5)
        .lean(),

      Order.find({ user: userId })
        .populate('driver', 'name phone image')
        .populate('store', 'name image')
        .populate('pickupAddress', 'addressLine city')
        .populate('deliveryAddress', 'addressLine city')
        .select('status totalPrice createdAt items')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      Store.find({ isOpen: true })
        .select('name image description type averageRating deliveryFee')
        .sort({ averageRating: -1 })
        .limit(10)
        .lean(),

      Review.find({ user: userId })
        .populate('store', 'name image')
        .select('rating comment createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      // جلب عدد الإشعارات غير المقروءة
      (async () => {
        return await Notification.countDocuments({
          user: userId,
          status: 'unread',
          expiresAt: { $gt: new Date() }
        });
      })()
    ]);

    const responseData = {
      success: true,
      data: {
        user,
        addresses,
        recentOrders: orders,
        topStores: stores,
        recentReviews: reviews,
        stats: {
          totalOrders: user?.stats?.totalOrders || 0,
          totalSpent: user?.stats?.totalSpent || 0,
          favoriteStores: stores.length,
          unreadNotifications: unreadNotifications || 0,
          addressesCount: addresses.length
        }
      },
      cached: false,
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 180);

    res.json(responseData);
  } catch (error) {
    console.error('❌ Dashboard aggregation error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 🔄 الحصول على المتاجر مع Pagination
 * GET /api/aggregate/stores
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
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    if (filters.type) {
      query.type = filters.type;
    }

    if (filters.tags) {
      query.tags = { $in: filters.tags };
    }

    if (filters.minRating) {
      query.averageRating = { $gte: Number(filters.minRating) };
    }

    const cacheKey = `stores:${JSON.stringify(query)}:${skip}:${limit}:${JSON.stringify(sort)}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log('📊 Serving paginated stores from cache');
      return res.json({
        ...cachedData,
        cached: true,
      });
    }

    console.log(`🔄 Fetching stores (page ${paginationOptions.page})`);

    const [stores, total] = await Promise.all([
      Store.find(query)
        .select('name image description type averageRating deliveryFee estimatedDeliveryTime tags openingHours')
        .populate('createdBy', 'name phone')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),

      Store.countDocuments(query),
    ]);

    const storesWithAddresses = await Promise.all(
      stores.map(async (store) => {
        const addresses = await StoreAddress.find({
          store: store._id,
        })
          .select('addressLine city latitude longitude')
          .limit(3)
          .lean();

        // ✅ تم التصحيح: استخدام Product بدلاً من 
        const itemsCount = await Product.countDocuments({
          store: store._id,
          isAvailable: true
        });

        const reviewsCount = await Review.countDocuments({
          store: store._id
        });

        return {
          ...store,
          addresses,
          stats: {
            itemsCount,
            reviewsCount,
            addressesCount: addresses.length
          }
        };
      })
    );

    const responseData = PaginationUtils.createPaginationResponse(
      storesWithAddresses,
      total,
      paginationOptions,
      {
        searchTerm: search || null,
        filtersApplied: Object.keys(filters).length > 0 ? filters : null,
      }
    );

    cache.set(cacheKey, responseData, 120);

    responseData.links = PaginationUtils.buildPaginationLinks(req, responseData.pagination);

    res.json(responseData);
  } catch (error) {
    console.error('❌ Paginated stores error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stores',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 🔄 الحصول على عناصر المتجر مع Pagination
 * GET /api/aggregate/items
 */
exports.getItemsPaginated = async (req, res) => {
  try {
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;

    let query = { isAvailable: true };

    if (filters.store) {
      query.store = filters.store;
    }

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.minPrice || filters.maxPrice) {
      query.price = {};
      if (filters.minPrice) query.price.$gte = Number(filters.minPrice);
      if (filters.maxPrice) query.price.$lte = Number(filters.maxPrice);
    }

    if (filters.tags) {
      query.tags = { $in: filters.tags };
    }

    if (filters.isVegetarian !== undefined) {
      query.isVegetarian = filters.isVegetarian === 'true';
    }

    if (filters.isVegan !== undefined) {
      query.isVegan = filters.isVegan === 'true';
    }

    const cacheKey = `items:${JSON.stringify(query)}:${skip}:${limit}:${JSON.stringify(sort)}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log('🍽️ Serving paginated items from cache');
      return res.json({
        ...cachedData,
        cached: true,
      });
    }

    // ✅ تم التصحيح: استخدام Product بدلاً من Item
    const [items, total] = await Promise.all([
      Product.find(query)
        .populate('store', 'name image type averageRating')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),

      Product.countDocuments(query),
    ]);

    // ✅ تم التصحيح: استخدام Product بدلاً من Item
    const categories = await Product.distinct('category', query);

    // ✅ تم التصحيح: استخدام Product بدلاً من Item
    const priceStats = await Product.aggregate([
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

    // ✅ تم التصحيح: استخدام Product بدلاً من Item
    const totalStores = await Product.distinct('store', query).then(ids => ids.length);

    const responseData = PaginationUtils.createPaginationResponse(
      items,
      total,
      paginationOptions,
      {
        categories,
        priceRange: priceStats[0] || { minPrice: 0, maxPrice: 0, avgPrice: 0 },
        totalStores
      }
    );

    cache.set(cacheKey, responseData, 180);
    responseData.links = PaginationUtils.buildPaginationLinks(req, responseData.pagination);

    res.json(responseData);
  } catch (error) {
    console.error('❌ Paginated items error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch items',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 🔄 الحصول على الطلبات مع Pagination (للأدمن)
 * GET /api/aggregate/orders/admin
 */
exports.getOrdersPaginatedAdmin = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;

    let query = {};

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.store) {
      query.store = filters.store;
    }

    if (filters.driver) {
      query.driver = filters.driver;
    }

    if (filters.user) {
      query.user = filters.user;
    }

    if (filters.minDate || filters.maxDate) {
      query.createdAt = {};
      if (filters.minDate) query.createdAt.$gte = new Date(filters.minDate);
      if (filters.maxDate) query.createdAt.$lte = new Date(filters.maxDate);
    }

    const cacheKey = `orders:admin:${JSON.stringify(query)}:${skip}:${limit}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log('📦 Serving admin orders from cache');
      return res.json({
        ...cachedData,
        cached: true,
      });
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'name phone email')
        .populate('driver', 'name phone')
        .populate('store', 'name image')
        .populate('pickupAddress', 'addressLine city')
        .populate('deliveryAddress', 'addressLine city')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),

      Order.countDocuments(query),
    ]);

    const stats = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$totalPrice' },
          avgOrderValue: { $avg: '$totalPrice' }
        },
      },
    ]);

    const totalRevenue = stats.reduce((sum, stat) => sum + stat.totalRevenue, 0);
    const totalOrders = stats.reduce((sum, stat) => sum + stat.count, 0);

    const responseData = PaginationUtils.createPaginationResponse(
      orders,
      total,
      paginationOptions,
      {
        stats: stats.reduce((acc, curr) => {
          acc[curr._id] = {
            count: curr.count,
            revenue: curr.totalRevenue,
            avgValue: curr.avgOrderValue
          };
          return acc;
        }, {}),
        summary: {
          totalRevenue,
          totalOrders,
          avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0
        }
      }
    );

    cache.set(cacheKey, responseData, 60);
    responseData.links = PaginationUtils.buildPaginationLinks(req, responseData.pagination);

    res.json(responseData);
  } catch (error) {
    console.error('❌ Paginated orders admin error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 2️⃣ تفاصيل متجر كاملة مع الكاش
 * GET /api/aggregate/stores/:id/full
 */
exports.getStoreDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!require('mongoose').Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرِّف المتجر غير صالح'
      });
    }

    const cacheKey = `store:full:${id}`;

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log(`🏪 Serving store ${id} from cache`);
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    console.log(`🔄 Fetching store ${id} from database`);

    const [
      store,
      addresses,
      reviews,
      items,
      categories
    ] = await Promise.all([
      Store.findById(id)
        .populate('owner', 'name phone email')
        .lean(),

      StoreAddress.find({ store: id })
        .select('addressLine city latitude longitude')
        .lean(),

      Review.find({ store: id })
        .populate('user', 'name image')
        .select('rating comment createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      // ✅ تم التصحيح: استخدام Product بدلاً من Item
      Product.find({ store: id, isAvailable: true })
        .select('name price image description category ingredients preparationTime')
        .sort({ category: 1, name: 1 })
        .lean(),

      // ✅ تم التصحيح: استخدام Product بدلاً من Item
      Product.distinct('category', { store: id, isAvailable: true })
    ]);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'المتجر غير موجود'
      });
    }

    const reviewStats = await Review.aggregate([
      { $match: { store: store._id } },
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

    const responseData = {
      success: true,
      data: {
        store,
        addresses,
        reviews,
        items,
        categories,
        stats: {
          reviewCount: reviews.length,
          itemCount: items.length,
          addressCount: addresses.length,
          averageRating: reviewStats[0]?.averageRating?.toFixed(1) || 0,
          totalReviews: reviewStats[0]?.totalReviews || 0
        }
      },
      cached: false,
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 300);

    res.json(responseData);
  } catch (error) {
    console.error('❌ Store details error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch store details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 3️⃣ تفاصيل الطلب مع التتبع (كاش أقصر مدة)
 * GET /api/aggregate/orders/:id/full
 */
exports.getOrderWithTracking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!require('mongoose').Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرِّف الطلب غير صالح'
      });
    }

    const cacheKey = `order:tracking:${id}:${userId}`;

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log(`📦 Serving order ${id} tracking from cache`);
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    console.log(`🔄 Fetching order ${id} tracking from database`);

    const order = await Order.findOne({ _id: id, user: userId })
      .populate('user', 'name phone image email')
      .populate('driver', 'name phone image rating totalDeliveries')
      .populate('store', 'name image phone addressLine')
      .populate('pickupAddress', 'label addressLine city latitude longitude')
      .populate('deliveryAddress', 'label addressLine city latitude longitude')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود أو ليس لديك صلاحية الوصول'
      });
    }

    let driverLocation = null;
    let locationHistory = [];

    if (order.driver) {
      [driverLocation, locationHistory] = await Promise.all([
        DriverLocation.findOne({
          driver: order.driver._id,
          order: order._id
        })
          .sort({ createdAt: -1 })
          .lean(),

        DriverLocation.find({
          driver: order.driver._id,
          order: order._id,
          createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // آخر 30 دقيقة
        })
          .select('location createdAt')
          .sort({ createdAt: 1 })
          .limit(20)
          .lean()
      ]);
    }

    const orderTimeline = [
      {
        status: 'created',
        title: 'تم إنشاء الطلب',
        description: 'تم استلام طلبك بنجاح',
        timestamp: order.createdAt,
        completed: true
      },
      {
        status: 'accepted',
        title: 'تم قبول الطلب',
        description: order.status === 'pending' ? 'قيد الانتظار' : 'تم القبول',
        timestamp: order.status === 'pending' ? null : order.updatedAt,
        completed: order.status !== 'pending'
      },
      {
        status: 'picked',
        title: 'تم استلام الطلب',
        description: order.status === 'picked' || order.status === 'delivered' ? 'تم الاستلام' : 'قيد الانتظار',
        timestamp: order.status === 'picked' || order.status === 'delivered' ? order.updatedAt : null,
        completed: order.status === 'picked' || order.status === 'delivered'
      },
      {
        status: 'delivered',
        title: 'تم التوصيل',
        description: order.status === 'delivered' ? 'تم التوصيل بنجاح' : 'قيد التوصيل',
        timestamp: order.status === 'delivered' ? order.updatedAt : null,
        completed: order.status === 'delivered'
      }
    ];

    const responseData = {
      success: true,
      data: {
        order,
        tracking: {
          currentLocation: driverLocation,
          locationHistory,
          isActive: !!driverLocation,
          lastUpdated: driverLocation?.createdAt || null,
          estimatedDeliveryTime: this.calculateETA(order)
        },
        timeline: orderTimeline,
        metadata: {
          hasDriver: !!order.driver,
          status: order.status,
          statusText: this.getStatusText(order.status),
          canCancel: ['pending', 'accepted'].includes(order.status),
          canContactDriver: !!order.driver && ['accepted', 'picked'].includes(order.status)
        }
      },
      cached: false,
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 30);

    res.json(responseData);
  } catch (error) {
    console.error('❌ Order tracking error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 4️⃣ بيانات صفحة الرئيسية مع كاش أطول
 * GET /api/aggregate/home
 */
exports.getHomeData = async (req, res) => {
  try {
    const cacheKey = 'home:data';

    const responseData = await cache.cacheWithFallback(
      cacheKey,
      async () => {
        console.log('🏠 Fetching home data from database');

        const [
          topStores,
          featuredItems,
          recentReviews,
          categories,
          stats
        ] = await Promise.all([
          Store.find({ isOpen: true })
            .sort({ averageRating: -1, ratingsCount: -1 })
            .limit(8)
            .select('name image averageRating type deliveryFee estimatedDeliveryTime')
            .lean(),

          // ✅ تم التصحيح: استخدام Product بدلاً من Item
          Product.find({ isAvailable: true })
            .populate('store', 'name image')
            .sort({ createdAt: -1 })
            .limit(12)
            .select('name price image store description category')
            .lean(),

          Review.find()
            .populate('user', 'name image')
            .populate('store', 'name image')
            .select('rating comment createdAt')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean(),

          Store.distinct('type', { isOpen: true }),

          Promise.all([
            Store.countDocuments({ isOpen: true }),
            // ✅ تم التصحيح: استخدام Product بدلاً من Item
            Product.countDocuments({ isAvailable: true }),
            Order.countDocuments({ status: 'delivered' }),
            Review.countDocuments()
          ])
        ]);

        return {
          success: true,
          data: {
            topStores,
            featuredItems,
            recentReviews,
            categories,
            stats: {
              storeCount: stats[0],
              itemCount: stats[1],
              ordersDelivered: stats[2],
              reviewsCount: stats[3]
            },
            promotions: [
              {
                id: 1,
                title: 'خصم 20% على أول طلب',
                description: 'استخدم الكود WELCOME20',
                validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                image: 'https://res.cloudinary.com/demo/image/upload/v1633456789/promotion1.jpg'
              },
              {
                id: 2,
                title: 'توصيل مجاني',
                description: 'للطلبات فوق 100 درهم',
                validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                image: 'https://res.cloudinary.com/demo/image/upload/v1633456789/promotion2.jpg'
              }
            ]
          },
          cached: false,
          timestamp: new Date()
        };
      },
      600
    );

    res.json(responseData);
  } catch (error) {
    console.error('❌ Home data error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to load home page data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 5️⃣ إدارة الكاش من خلال API
 * POST /api/aggregate/cache/clear
 */
exports.clearCache = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { pattern, key } = req.body;

    let result;

    if (key) {
      const deleted = cache.del(key);
      result = {
        action: 'delete_key',
        key,
        deletedCount: deleted
      };
    } else if (pattern) {
      const clearedCount = cache.invalidatePattern(pattern);
      result = {
        action: 'clear_pattern',
        pattern,
        clearedCount
      };
    } else {
      const clearedKeys = cache.flush();
      result = {
        action: 'flush_all',
        clearedKeys
      };
    }

    res.json({
      success: true,
      message: 'Cache cleared successfully',
      data: result,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Cache clear error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 6️⃣ الحصول على إحصائيات الكاش
 * GET /api/aggregate/cache/stats
 */
exports.getCacheStats = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const stats = cache.getStats();
    const info = cache.getCacheInfo();

    res.json({
      success: true,
      data: {
        ...info,
        details: stats,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Cache stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cache statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    مسح الكاش بنمط محدد
 * @route   POST /api/aggregate/cache/clear/:pattern
 * @access  Admin
 */
exports.clearCachePattern = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { pattern } = req.params;

    if (!pattern) {
      return res.status(400).json({
        success: false,
        message: 'Pattern is required'
      });
    }

    // فك ترميز pattern إذا كان مشفراً
    const decodedPattern = decodeURIComponent(pattern);

    const clearedCount = cache.invalidatePattern(decodedPattern);

    res.json({
      success: true,
      message: 'Cache cleared successfully',
      data: {
        action: 'clear_pattern',
        pattern: decodedPattern,
        clearedCount
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Cache clear pattern error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache pattern',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    لوحة تحكم الأدمن
 * @route   GET /api/aggregate/admin/dashboard
 * @access  Admin
 */
exports.getAdminDashboard = async (req, res) => {
  try {
    const [
      totalUsers,
      totalOrders,
      totalStores,
      totalDrivers,
      pendingOrders,
      recentOrders,
      revenueToday,
      usersByRole
    ] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      Store.countDocuments(),
      User.countDocuments({ role: 'driver' }),
      Order.countDocuments({ status: 'pending' }),
      Order.find()
        .populate('user', 'name')
        .populate('store', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            status: 'delivered'
          }
        },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]),
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalOrders,
          totalStores,
          totalDrivers,
          pendingOrders,
          revenueToday: revenueToday[0]?.total || 0
        },
        usersByRole,
        recentOrders,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('❌ Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load admin dashboard'
    });
  }
};

/**
 * @desc    إحصائيات الأدمن العامة
 * @route   GET /api/aggregate/admin/stats
 * @access  Admin
 */
exports.getAdminStats = async (req, res) => {
  try {
    const { period = 'week' } = req.query;

    const startDate = new Date();
    switch (period) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const [
      ordersByDay,
      topStores,
      topUsers,
      revenueStats
    ] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
            revenue: { $sum: '$totalPrice' }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'delivered'
          }
        },
        {
          $group: {
            _id: '$store',
            orders: { $sum: 1 },
            revenue: { $sum: '$totalPrice' }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'stores',
            localField: '_id',
            foreignField: '_id',
            as: 'storeInfo'
          }
        }
      ]),

      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'delivered'
          }
        },
        {
          $group: {
            _id: '$user',
            orders: { $sum: 1 },
            spent: { $sum: '$totalPrice' }
          }
        },
        { $sort: { spent: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userInfo'
          }
        }
      ]),

      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'delivered'
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalPrice' },
            totalOrders: { $sum: 1 },
            avgOrderValue: { $avg: '$totalPrice' }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: {
        period,
        ordersByDay,
        topStores: topStores.map(r => ({
          ...r,
          name: r.storeInfo[0]?.name || 'Unknown'
        })),
        topUsers: topUsers.map(u => ({
          ...u,
          name: u.userInfo[0]?.name || 'Unknown'
        })),
        revenue: revenueStats[0] || { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 },
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('❌ Admin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load admin statistics'
    });
  }
};

/**
 * @desc    إحصائيات المستخدمين للأدمن
 * @route   GET /api/aggregate/admin/stats/users
 * @access  Admin
 */
exports.getAdminUserStats = async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          byRole: [
            { $group: { _id: '$role', count: { $sum: 1 } } }
          ],
          byStatus: [
            {
              $group: {
                _id: null,
                active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
                inactive: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] } },
                verified: { $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] } },
                unverified: { $sum: { $cond: [{ $eq: ['$isVerified', false] }, 1, 0] } }
              }
            }
          ],
          byMonth: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } },
            { $limit: 12 }
          ]
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        total: stats[0]?.total[0]?.count || 0,
        byRole: stats[0]?.byRole || [],
        byStatus: stats[0]?.byStatus[0] || { active: 0, inactive: 0, verified: 0, unverified: 0 },
        byMonth: stats[0]?.byMonth || []
      }
    });
  } catch (error) {
    console.error('❌ Admin user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load user statistics'
    });
  }
};

/**
 * @desc    إحصائيات الطلبات للأدمن
 * @route   GET /api/aggregate/admin/stats/orders
 * @access  Admin
 */
exports.getAdminOrderStats = async (req, res) => {
  try {
    const stats = await Order.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          revenue: [
            {
              $group: {
                _id: null,
                total: { $sum: '$totalPrice' },
                avg: { $avg: '$totalPrice' },
                min: { $min: '$totalPrice' },
                max: { $max: '$totalPrice' }
              }
            }
          ],
          byDay: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $sum: 1 },
                revenue: { $sum: '$totalPrice' }
              }
            },
            { $sort: { _id: -1 } },
            { $limit: 30 }
          ]
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        total: stats[0]?.total[0]?.count || 0,
        byStatus: stats[0]?.byStatus || [],
        revenue: stats[0]?.revenue[0] || { total: 0, avg: 0, min: 0, max: 0 },
        byDay: stats[0]?.byDay || []
      }
    });
  } catch (error) {
    console.error('❌ Admin order stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load order statistics'
    });
  }
};

/**
 * @desc    إحصائيات الإيرادات للأدمن
 * @route   GET /api/aggregate/admin/stats/revenue
 * @access  Admin
 */
exports.getAdminRevenueStats = async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    const startDate = new Date();
    switch (period) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const revenue = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          revenue: { $sum: '$totalPrice' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    const total = await Order.aggregate([
      {
        $match: {
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalPrice' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period,
        revenue,
        total: total[0] || { total: 0, count: 0 },
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('❌ Admin revenue stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load revenue statistics'
    });
  }
};

/**
 * @desc    تحليلات المستخدمين
 * @route   GET /api/aggregate/admin/analytics/users
 * @access  Admin
 */
exports.getUserAnalytics = async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    const startDate = new Date();
    if (period === 'month') startDate.setMonth(startDate.getMonth() - 1);
    else if (period === 'year') startDate.setFullYear(startDate.getFullYear() - 1);
    else startDate.setDate(startDate.getDate() - 30);

    const [growth, retention, byLocation] = await Promise.all([
      // نمو المستخدمين
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            newUsers: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // الاحتفاظ بالمستخدمين
      User.aggregate([
        {
          $facet: {
            active: [
              {
                $match: {
                  lastLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                }
              },
              { $count: 'count' }
            ],
            returning: [
              {
                $match: {
                  createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                  lastLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                }
              },
              { $count: 'count' }
            ]
          }
        }
      ]),

      // المستخدمين حسب المدينة
      User.aggregate([
        {
          $group: {
            _id: '$city',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.json({
      success: true,
      data: {
        growth: {
          labels: growth.map(g => g._id),
          data: growth.map(g => g.newUsers)
        },
        retention: {
          active: retention[0]?.active[0]?.count || 0,
          returning: retention[0]?.returning[0]?.count || 0,
          rate: retention[0]?.active[0]?.count ?
            ((retention[0]?.returning[0]?.count || 0) / retention[0]?.active[0]?.count * 100).toFixed(1) : 0
        },
        byLocation
      }
    });
  } catch (error) {
    console.error('❌ Get user analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user analytics'
    });
  }
};

/**
 * @desc    تحليلات الطلبات
 * @route   GET /api/aggregate/admin/analytics/orders
 * @access  Admin
 */
exports.getOrderAnalytics = async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    const startDate = new Date();
    if (period === 'month') startDate.setMonth(startDate.getMonth() - 1);
    else if (period === 'year') startDate.setFullYear(startDate.getFullYear() - 1);
    else startDate.setDate(startDate.getDate() - 30);

    const [trends, byHour, completionRate] = await Promise.all([
      // اتجاهات الطلبات
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            orders: { $sum: 1 },
            revenue: { $sum: '$totalPrice' }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // الطلبات حسب الساعة
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // معدل الإكمال
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
            },
            cancelled: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
            }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: {
        trends: {
          labels: trends.map(t => t._id),
          orders: trends.map(t => t.orders),
          revenue: trends.map(t => t.revenue)
        },
        byHour: {
          labels: byHour.map(h => `${h._id}:00`),
          data: byHour.map(h => h.count)
        },
        completion: {
          rate: completionRate[0] ?
            ((completionRate[0].completed / completionRate[0].total) * 100).toFixed(1) : 0,
          total: completionRate[0]?.total || 0,
          completed: completionRate[0]?.completed || 0,
          cancelled: completionRate[0]?.cancelled || 0
        }
      }
    });
  } catch (error) {
    console.error('❌ Get order analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get order analytics'
    });
  }
};

/**
 * @desc    تحليلات الإيرادات
 * @route   GET /api/aggregate/admin/analytics/revenue
 * @access  Admin
 */
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    const startDate = new Date();
    if (period === 'month') startDate.setMonth(startDate.getMonth() - 1);
    else if (period === 'year') startDate.setFullYear(startDate.getFullYear() - 1);
    else startDate.setDate(startDate.getDate() - 30);

    const previousStartDate = new Date(startDate);
    previousStartDate.setMonth(previousStartDate.getMonth() - 1);

    const [current, previous, byDay, byCategory] = await Promise.all([
      // الإيرادات الحالية
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'delivered'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalPrice' },
            avg: { $avg: '$totalPrice' },
            count: { $sum: 1 }
          }
        }
      ]),

      // الإيرادات السابقة للمقارنة
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: previousStartDate, $lt: startDate },
            status: 'delivered'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalPrice' }
          }
        }
      ]),

      // الإيرادات اليومية
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'delivered'
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            revenue: { $sum: '$totalPrice' },
            orders: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // الإيرادات حسب الفئة
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'delivered'
          }
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.category',
            revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
            quantity: { $sum: '$items.qty' }
          }
        },
        { $sort: { revenue: -1 } }
      ])
    ]);

    const currentTotal = current[0]?.total || 0;
    const previousTotal = previous[0]?.total || 0;
    const change = calculateChange(currentTotal, previousTotal);

    res.json({
      success: true,
      data: {
        summary: {
          total: currentTotal,
          average: current[0]?.avg || 0,
          orderCount: current[0]?.count || 0,
          change
        },
        daily: {
          labels: byDay.map(d => d._id),
          revenue: byDay.map(d => d.revenue),
          orders: byDay.map(d => d.orders)
        },
        byCategory: byCategory.map(c => ({
          category: c._id || 'other',
          revenue: c.revenue,
          quantity: c.quantity
        }))
      }
    });
  } catch (error) {
    console.error('❌ Get revenue analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get revenue analytics'
    });
  }
};

/**
 * @desc    بحث موحد في جميع المحتويات
 * @route   GET /api/aggregate/search
 * @access  Public
 */
exports.unifiedSearch = async (req, res) => {
  try {
    const { q: searchTerm, type, limit = 10 } = req.query;

    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }

    const results = {};

    // البحث في المتاجر
    if (!type || type === 'stores') {
      const stores = await Store.find({
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { description: { $regex: searchTerm, $options: 'i' } },
          { tags: { $regex: searchTerm, $options: 'i' } }
        ],
        isOpen: true
      })
        .select('name image description type averageRating deliveryFee')
        .limit(limit)
        .lean();

      results.stores = stores;
    }

    // البحث في الأصناف
    if (!type || type === 'items') {
      // ✅ تم التصحيح: استخدام Product بدلاً من Item
      const items = await Product.find({
        name: { $regex: searchTerm, $options: 'i' },
        isAvailable: true
      })
        .populate('store', 'name image')
        .select('name price image description category')
        .limit(limit)
        .lean();

      results.items = items;
    }

    // البحث في المستخدمين (للمسجلين فقط)
    if (req.user && (!type || type === 'users')) {
      const users = await User.find({
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { email: { $regex: searchTerm, $options: 'i' } }
        ],
        isActive: true
      })
        .select('name image role')
        .limit(limit)
        .lean();

      results.users = users;
    }

    // البحث في الطلبات (للمستخدم نفسه فقط)
    if (req.user && (!type || type === 'orders')) {
      const orders = await Order.find({
        user: req.user.id,
        'items.name': { $regex: searchTerm, $options: 'i' }
      })
        .populate('store', 'name')
        .select('status totalPrice createdAt')
        .limit(limit)
        .lean();

      results.orders = orders;
    }

    res.json({
      success: true,
      data: results,
      searchTerm,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Unified search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};

/**
 * @desc    إحصائيات عامة للتطبيق
 * @route   GET /api/aggregate/stats
 * @access  Public
 */
exports.getPublicStats = async (req, res) => {
  try {
    const cacheKey = 'public:stats';
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const [
      totalStores,
      totalItems,
      totalOrders,
      totalReviews,
      averageRating,
      topCategories,
      topCities
    ] = await Promise.all([
      // إجمالي المتاجر
      Store.countDocuments({ isOpen: true }),

      // ✅ تم التصحيح: استخدام Product بدلاً من Item
      Product.countDocuments({ isAvailable: true }),

      // إجمالي الطلبات المكتملة
      Order.countDocuments({ status: 'delivered' }),

      // إجمالي التقييمات
      Review.countDocuments(),

      // متوسط التقييم العام
      Review.aggregate([
        { $group: { _id: null, avg: { $avg: '$rating' } } }
      ]),

      // ✅ تم التصحيح: استخدام Product بدلاً من Item
      Product.aggregate([
        { $match: { isAvailable: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),

      // أفضل المدن
      StoreAddress.aggregate([
        { $group: { _id: '$city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ]);

    const stats = {
      stores: totalStores,
      items: totalItems,
      orders: totalOrders,
      reviews: totalReviews,
      averageRating: averageRating[0]?.avg?.toFixed(1) || 0,
      topCategories: topCategories.map(c => ({
        name: c._id || 'other',
        count: c.count
      })),
      topCities: topCities.map(c => ({
        name: c._id || 'Niamey',
        count: c.count
      })),
      timestamp: new Date()
    };

    cache.set(cacheKey, stats, 600); // 10 دقائق

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Public stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics'
    });
  }
};

/**
 * @desc    الحصول على طلبات المستخدم مع Pagination
 * @route   GET /api/aggregate/orders/me
 * @access  Authenticated
 */
exports.getMyOrdersPaginated = async (req, res) => {
  try {
    const userId = req.user.id;
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;

    let query = { user: userId };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.store) {
      query.store = filters.store;
    }

    if (filters.minDate || filters.maxDate) {
      query.createdAt = {};
      if (filters.minDate) query.createdAt.$gte = new Date(filters.minDate);
      if (filters.maxDate) query.createdAt.$lte = new Date(filters.maxDate);
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('driver', 'name phone image')
        .populate('store', 'name image')
        .populate('pickupAddress', 'label addressLine city')
        .populate('deliveryAddress', 'label addressLine city')
        .select('status totalPrice createdAt items estimatedDeliveryTime')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),

      Order.countDocuments(query)
    ]);

    // إضافة معلومات إضافية لكل طلب
    const ordersWithDetails = orders.map(order => ({
      ...order,
      statusText: getStatusText(order.status),
      estimatedDelivery: calculateETA(order),
      itemCount: order.items?.reduce((sum, item) => sum + (item.qty || 0), 0) || 0
    }));

    // إحصائيات الطلبات
    const orderStats = await Order.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalPrice' }
        }
      }
    ]);

    const stats = orderStats.reduce((acc, stat) => {
      acc[stat._id] = {
        count: stat.count,
        amount: stat.totalAmount
      };
      return acc;
    }, {});

    const totalSpent = orderStats.reduce((sum, stat) => sum + stat.totalAmount, 0);

    const response = PaginationUtils.createPaginationResponse(
      ordersWithDetails,
      total,
      paginationOptions,
      {
        stats,
        summary: {
          totalOrders: total,
          totalSpent,
          averageOrderValue: total > 0 ? totalSpent / total : 0
        }
      }
    );

    res.json(response);
  } catch (error) {
    console.error('❌ Get my orders error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الطلبات'
    });
  }
};

// ====== دوال مساعدة ======

/**
 * حساب وقت التوصيل المتوقع
 */
exports.calculateETA = (order) => {
  const statusTimes = {
    pending: '15-25 دقيقة',
    accepted: '10-20 دقيقة',
    picked: '5-15 دقيقة',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي'
  };

  return statusTimes[order.status] || 'غير معروف';
};

/**
 * الحصول على نص الحالة
 */
exports.getStatusText = (status) => {
  const statusTexts = {
    pending: 'قيد الانتظار',
    accepted: 'تم القبول',
    picked: 'تم الاستلام',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي'
  };

  return statusTexts[status] || 'غير معروف';
};

// دالة مساعدة لحساب التغير (للاستخدام الداخلي)
function calculateChange(current, previous) {
  if (!previous || previous === 0) return { percentage: 100, trend: 'up' };
  const change = ((current - previous) / previous) * 100;
  return {
    percentage: Math.abs(change).toFixed(1),
    trend: change >= 0 ? 'up' : 'down'
  };
}

/**
 * @desc    تصدير تقرير الطلبات
 * @route   GET /api/v1/admin/reports/orders
 * @access  Admin
 */
exports.exportOrdersReport = async (req, res) => {
  try {
    const { from, to, format = 'json' } = req.query;

    let dateQuery = {};
    if (from || to) {
      dateQuery = {};
      if (from) dateQuery.$gte = new Date(from);
      if (to) dateQuery.$lte = new Date(to);
    }

    const orders = await Order.find(dateQuery)
      .populate('user', 'name phone')
      .populate('store', 'name')
      .populate('driver', 'name phone')
      .sort({ createdAt: -1 })
      .lean();

    if (format === 'json') {
      return res.json({
        success: true,
        data: orders,
        count: orders.length,
        generatedAt: new Date()
      });
    }

    // يمكن إضافة تصدير CSV أو Excel هنا
    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    console.error("❌ Export orders error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تصدير التقرير"
    });
  }
};

/**
 * @desc    تصدير تقرير المستخدمين
 */
exports.exportUsersReport = async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password -verificationCode -resetPasswordToken')
      .lean();

    res.json({
      success: true,
      data: users,
      count: users.length,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error("❌ Export users error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تصدير تقرير المستخدمين"
    });
  }
};

/**
 * @desc    تصدير تقرير الإيرادات
 */
exports.exportRevenueReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    let dateQuery = {};
    if (from || to) {
      dateQuery = {};
      if (from) dateQuery.$gte = new Date(from);
      if (to) dateQuery.$lte = new Date(to);
    }

    const revenue = await Order.aggregate([
      {
        $match: {
          status: 'delivered',
          ...dateQuery
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          totalRevenue: { $sum: "$totalPrice" },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: "$totalPrice" }
        }
      },
      { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } }
    ]);

    res.json({
      success: true,
      data: revenue,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error("❌ Export revenue error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تصدير تقرير الإيرادات"
    });
  }
};

/**
 * @desc    تصدير تقرير المندوبين
 */
exports.exportDriversReport = async (req, res) => {
  try {
    const drivers = await User.find({ role: 'driver' })
      .select('name phone email driverInfo stats.isOnline')
      .lean();

    const driversWithStats = await Promise.all(
      drivers.map(async (driver) => {
        const deliveries = await Order.countDocuments({
          driver: driver._id,
          status: 'delivered'
        });

        const earnings = await Order.aggregate([
          {
            $match: {
              driver: driver._id,
              status: 'delivered'
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $multiply: ["$totalPrice", 0.8] } }
            }
          }
        ]);

        return {
          ...driver,
          totalDeliveries: deliveries,
          totalEarnings: earnings[0]?.total || 0
        };
      })
    );

    res.json({
      success: true,
      data: driversWithStats,
      count: driversWithStats.length,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error("❌ Export drivers error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تصدير تقرير المندوبين"
    });
  }
};

/**
 * @desc    تصدير تقرير المتاجر
 */
exports.exportStoresReport = async (req, res) => {
  try {
    const stores = await Store.find({})
      .populate('owner', 'name phone')
      .lean();

    const storesWithStats = await Promise.all(
      stores.map(async (store) => {
        const products = await Product.countDocuments({ store: store._id });
        const orders = await Order.countDocuments({ store: store._id });
        const revenue = await Order.aggregate([
          {
            $match: {
              store: store._id,
              status: 'delivered'
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$totalPrice" }
            }
          }
        ]);

        return {
          ...store,
          totalProducts: products,
          totalOrders: orders,
          totalRevenue: revenue[0]?.total || 0
        };
      })
    );

    res.json({
      success: true,
      data: storesWithStats,
      count: storesWithStats.length,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error("❌ Export stores error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تصدير تقرير المتاجر"
    });
  }
};

/**
 * @desc    إحصائيات متقدمة يومية
 * @route   GET /api/v1/admin/advanced-stats/daily
 * @access  Admin
 */
exports.getDailyAdvancedStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stats = await Promise.all([
      // الطلبات اليوم
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: today, $lt: tomorrow }
          }
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$totalPrice' },
            pendingOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
            },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
            },
            cancelledOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
            }
          }
        }
      ]),

      // المستخدمين الجدد اليوم
      User.countDocuments({
        createdAt: { $gte: today, $lt: tomorrow }
      }),

      // المتاجر الجديدة اليوم
      Store.countDocuments({
        createdAt: { $gte: today, $lt: tomorrow }
      }),

      // الطلبات حسب الساعة
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: today, $lt: tomorrow }
          }
        },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            count: { $sum: 1 },
            revenue: { $sum: '$totalPrice' }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        date: today,
        orders: stats[0][0] || {
          totalOrders: 0,
          totalRevenue: 0,
          pendingOrders: 0,
          completedOrders: 0,
          cancelledOrders: 0
        },
        newUsers: stats[1],
        newStores: stats[2],
        hourlyStats: stats[3]
      }
    });
  } catch (error) {
    console.error("❌ Get daily advanced stats error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب الإحصائيات اليومية المتقدمة"
    });
  }
};

/**
 * @desc    إحصائيات متقدمة أسبوعية
 * @route   GET /api/v1/admin/advanced-stats/weekly
 * @access  Admin
 */
exports.getWeeklyAdvancedStats = async (req, res) => {
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: weekAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalPrice' },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: weekAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          newUsers: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const totalWeek = stats.reduce((sum, day) => sum + day.revenue, 0);
    const avgDaily = stats.length > 0 ? totalWeek / stats.length : 0;

    res.json({
      success: true,
      data: {
        dailyStats: stats,
        userGrowth,
        summary: {
          totalRevenue: totalWeek,
          averageDailyRevenue: avgDaily,
          bestDay: stats.reduce((best, day) =>
            day.revenue > (best?.revenue || 0) ? day : best, null),
          worstDay: stats.reduce((worst, day) =>
            day.revenue < (worst?.revenue || Infinity) ? day : worst, stats[0])
        }
      }
    });
  } catch (error) {
    console.error("❌ Get weekly advanced stats error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب الإحصائيات الأسبوعية المتقدمة"
    });
  }
};

/**
 * @desc    إحصائيات متقدمة شهرية
 * @route   GET /api/v1/admin/advanced-stats/monthly
 * @access  Admin
 */
exports.getMonthlyAdvancedStats = async (req, res) => {
  try {
    const { year, month } = req.query;

    let startDate, endDate;

    if (year && month) {
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 1);
    } else {
      startDate = new Date();
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $facet: {
          daily: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                orders: { $sum: 1 },
                revenue: { $sum: '$totalPrice' }
              }
            },
            { $sort: { _id: 1 } }
          ],
          byStatus: [
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
                revenue: { $sum: '$totalPrice' }
              }
            }
          ],
          totals: [
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: '$totalPrice' },
                avgOrderValue: { $avg: '$totalPrice' }
              }
            }
          ]
        }
      }
    ]);

    const usersThisMonth = await User.countDocuments({
      createdAt: { $gte: startDate, $lt: endDate }
    });

    const storesThisMonth = await Store.countDocuments({
      createdAt: { $gte: startDate, $lt: endDate }
    });

    res.json({
      success: true,
      data: {
        period: {
          year: startDate.getFullYear(),
          month: startDate.getMonth() + 1,
          monthName: startDate.toLocaleString('ar-SA', { month: 'long' })
        },
        orders: stats[0]?.daily || [],
        byStatus: stats[0]?.byStatus || [],
        totals: stats[0]?.totals[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          avgOrderValue: 0
        },
        newUsers: usersThisMonth,
        newStores: storesThisMonth,
        projectedRevenue: (stats[0]?.totals[0]?.totalRevenue || 0) * 1.1
      }
    });
  } catch (error) {
    console.error("❌ Get monthly advanced stats error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب الإحصائيات الشهرية المتقدمة"
    });
  }
};

/**
 * @desc    إحصائيات مخصصة (فترة زمنية مخصصة)
 * @route   GET /api/v1/admin/advanced-stats/custom
 * @access  Admin
 */
exports.getCustomStats = async (req, res) => {
  try {
    const { from, to, groupBy = 'day' } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: "تاريخ البداية والنهاية مطلوبان"
      });
    }

    const startDate = new Date(from);
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);

    let groupFormat;
    switch (groupBy) {
      case 'hour':
        groupFormat = '%Y-%m-%d %H:00';
        break;
      case 'day':
        groupFormat = '%Y-%m-%d';
        break;
      case 'week':
        groupFormat = '%Y-%U';
        break;
      case 'month':
        groupFormat = '%Y-%m';
        break;
      default:
        groupFormat = '%Y-%m-%d';
    }

    const orders = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalPrice' },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const users = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const stores = await Store.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const totalRevenue = orders.reduce((sum, period) => sum + period.revenue, 0);

    res.json({
      success: true,
      data: {
        period: {
          from: startDate,
          to: endDate,
          groupBy
        },
        stats: orders,
        summary: {
          totalOrders: orders.reduce((sum, period) => sum + period.orders, 0),
          totalRevenue,
          averagePerPeriod: orders.length > 0 ? totalRevenue / orders.length : 0,
          newUsers: users,
          newStores: stores,
          daysInPeriod: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
        }
      }
    });
  } catch (error) {
    console.error("❌ Get custom stats error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب الإحصائيات المخصصة"
    });
  }
};