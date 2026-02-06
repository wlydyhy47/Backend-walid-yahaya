const User = require('../models/user.model');
const Address = require('../models/address.model');
const Order = require('../models/order.model');
const Restaurant = require('../models/restaurant.model');
const RestaurantAddress = require('../models/restaurantAddress.model');
const Review = require('../models/review.model');
const Item = require('../models/item.model');
const DriverLocation = require('../models/driverLocation.model');
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
      restaurants,
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
        .populate('restaurant', 'name image')
        .populate('pickupAddress', 'addressLine city')
        .populate('deliveryAddress', 'addressLine city')
        .select('status totalPrice createdAt items')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      
      Restaurant.find({ isOpen: true })
        .select('name image description type averageRating deliveryFee')
        .sort({ averageRating: -1 })
        .limit(10)
        .lean(),
      
      Review.find({ user: userId })
        .populate('restaurant', 'name image')
        .select('rating comment createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      
      // جلب عدد الإشعارات غير المقروءة
      (async () => {
        const Notification = require('../models/notification.model');
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
        topRestaurants: restaurants,
        recentReviews: reviews,
        stats: {
          totalOrders: user?.stats?.totalOrders || 0,
          totalSpent: user?.stats?.totalSpent || 0,
          favoriteRestaurants: restaurants.length,
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
 * 🔄 الحصول على المطاعم مع Pagination
 * GET /api/aggregate/restaurants
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

    const cacheKey = `restaurants:${JSON.stringify(query)}:${skip}:${limit}:${JSON.stringify(sort)}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log('📊 Serving paginated restaurants from cache');
      return res.json({
        ...cachedData,
        cached: true,
      });
    }

    console.log(`🔄 Fetching restaurants (page ${paginationOptions.page})`);
    
    const [restaurants, total] = await Promise.all([
      Restaurant.find(query)
        .select('name image description type averageRating deliveryFee estimatedDeliveryTime tags openingHours')
        .populate('createdBy', 'name phone')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      
      Restaurant.countDocuments(query),
    ]);

    const restaurantsWithAddresses = await Promise.all(
      restaurants.map(async (restaurant) => {
        const addresses = await RestaurantAddress.find({
          restaurant: restaurant._id,
        })
        .select('addressLine city latitude longitude')
        .limit(3)
        .lean();
        
        const itemsCount = await Item.countDocuments({
          restaurant: restaurant._id,
          isAvailable: true
        });
        
        const reviewsCount = await Review.countDocuments({
          restaurant: restaurant._id
        });
        
        return {
          ...restaurant,
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
      restaurantsWithAddresses,
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
    console.error('❌ Paginated restaurants error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch restaurants',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 🔄 الحصول على عناصر المطعم مع Pagination
 * GET /api/aggregate/items
 */
exports.getItemsPaginated = async (req, res) => {
  try {
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;
    
    let query = { isAvailable: true };
    
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

    const [items, total] = await Promise.all([
      Item.find(query)
        .populate('restaurant', 'name image type averageRating')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      
      Item.countDocuments(query),
    ]);

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
      items,
      total,
      paginationOptions,
      {
        categories,
        priceRange: priceStats[0] || { minPrice: 0, maxPrice: 0, avgPrice: 0 },
        totalRestaurants: await Item.distinct('restaurant', query).then(ids => ids.length)
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
    
    if (filters.restaurant) {
      query.restaurant = filters.restaurant;
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
        .populate('restaurant', 'name image')
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
 * 2️⃣ تفاصيل مطعم كاملة مع الكاش
 * GET /api/aggregate/restaurants/:id/full
 */
exports.getRestaurantDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!require('mongoose').Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'معرِّف المطعم غير صالح' 
      });
    }
    
    const cacheKey = `restaurant:full:${id}`;
    
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log(`🏪 Serving restaurant ${id} from cache`);
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    console.log(`🔄 Fetching restaurant ${id} from database`);
    
    const [
      restaurant,
      addresses,
      reviews,
      items,
      categories
    ] = await Promise.all([
      Restaurant.findById(id)
        .populate('createdBy', 'name phone email')
        .lean(),
      
      RestaurantAddress.find({ restaurant: id })
        .select('addressLine city latitude longitude')
        .lean(),
      
      Review.find({ restaurant: id })
        .populate('user', 'name image')
        .select('rating comment createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      
      Item.find({ restaurant: id, isAvailable: true })
        .select('name price image description category ingredients preparationTime')
        .sort({ category: 1, name: 1 })
        .lean(),
      
      Item.distinct('category', { restaurant: id, isAvailable: true })
    ]);

    if (!restaurant) {
      return res.status(404).json({ 
        success: false, 
        message: 'المطعم غير موجود' 
      });
    }

    const reviewStats = await Review.aggregate([
      { $match: { restaurant: restaurant._id } },
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
        restaurant,
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
    console.error('❌ Restaurant details error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch restaurant details',
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
      .populate('restaurant', 'name image phone addressLine')
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
          topRestaurants,
          featuredItems,
          recentReviews,
          categories,
          stats
        ] = await Promise.all([
          Restaurant.find({ isOpen: true })
            .sort({ averageRating: -1, ratingsCount: -1 })
            .limit(8)
            .select('name image averageRating type deliveryFee estimatedDeliveryTime')
            .lean(),
          
          Item.find({ isAvailable: true })
            .populate('restaurant', 'name image')
            .sort({ createdAt: -1 })
            .limit(12)
            .select('name price image restaurant description category')
            .lean(),
          
          Review.find()
            .populate('user', 'name image')
            .populate('restaurant', 'name image')
            .select('rating comment createdAt')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean(),
          
          Restaurant.distinct('type', { isOpen: true }),
          
          Promise.all([
            Restaurant.countDocuments({ isOpen: true }),
            Item.countDocuments({ isAvailable: true }),
            Order.countDocuments({ status: 'delivered' }),
            Review.countDocuments()
          ])
        ]);

        return {
          success: true,
          data: {
            topRestaurants,
            featuredItems,
            recentReviews,
            categories,
            stats: {
              restaurantCount: stats[0],
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

// ====== دوال مساعدة ======

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