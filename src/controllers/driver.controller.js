// ============================================
// ملف: src/controllers/driver.controller.js
// الوصف: إدارة عمليات المندوبين
// الإصدار: 1.0
// ============================================

const { User, Order, DriverLocation } = require('../models');
const cache = require("../utils/cache.util");
const PaginationUtils = require('../utils/pagination.util');
const fileService = require('../services/file.service');
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة ==========

/**
 * إبطال كاش المندوب
 */
const invalidateDriverCache = (driverId) => {
  cache.del(`driver:profile:${driverId}`);
  cache.del(`driver:stats:${driverId}`);
  cache.invalidatePattern(`driver:orders:${driverId}:*`);
  cache.del(`user:complete:${driverId}`);
};

// ========== 2. دوال المندوب الحالي ==========

/**
 * @desc    الحصول على ملف المندوب الشخصي
 * @route   GET /api/driver/me
 * @access  Driver
 */
exports.getMyProfile = async (req, res) => {
  try {
    const driverId = req.user.id;

    const cacheKey = `driver:profile:${driverId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const driver = await User.findById(driverId)
      .select('name phone image email driverInfo stats.isOnline lastLogin')
      .lean();

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    const [todayOrders, totalEarnings, currentOrder] = await Promise.all([
      Order.countDocuments({
        driver: driverId,
        status: 'delivered',
        createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
      }),

      Order.aggregate([
        { $match: { driver: driverId, status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]),

      Order.findOne({
        driver: driverId,
        status: { $in: ['accepted', 'picked'] }
      }).select('_id status pickupAddress deliveryAddress')
    ]);

    const profileData = {
      ...driver,
      stats: {
        ...driver.stats,
        todayOrders,
        totalEarnings: totalEarnings[0]?.total || 0,
        currentOrder: currentOrder || null
      }
    };

    cache.set(cacheKey, profileData, 300);

    res.json({
      success: true,
      data: profileData
    });
  } catch (error) {
    console.error("❌ Get driver profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get driver profile"
    });
  }
};

/**
 * @desc    ✅ تحديث حالة التوفر (متصل/غير متصل) - معدل لدعم isAvailable
 * @route   PUT /api/v1/driver/profile/availability
 * @access  Driver
 */
exports.toggleAvailability = async (req, res) => {
  try {
    const driverId = req.user.id;
    
    // ✅ استقبال كلا الحقلين (isOnline و isAvailable)
    const { isAvailable, isOnline } = req.body;
    
    // ✅ تحديد القيمة النهائية (أي حقل تم إرساله)
    let finalStatus = null;
    
    if (isAvailable !== undefined) {
      finalStatus = isAvailable;
    } else if (isOnline !== undefined) {
      finalStatus = isOnline;
    }
    
    // ✅ التحقق من وجود قيمة
    if (finalStatus === null) {
      return res.status(400).json({
        success: false,
        message: "يجب توفير حالة التوفر (isAvailable أو isOnline)"
      });
    }
    
    console.log(`🔄 Driver ${driverId} toggling availability to: ${finalStatus}`);

    // ✅ تحديث قاعدة البيانات
    const driver = await User.findByIdAndUpdate(
      driverId,
      {
        'driverInfo.isAvailable': finalStatus,
        isOnline: finalStatus,
        lastStatusUpdate: new Date()
      },
      { new: true, runValidators: false }
    ).select('driverInfo.isAvailable isOnline name lastStatusUpdate');

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "المندوب غير موجود"
      });
    }

    // إبطال الكاش
    invalidateDriverCache(driverId);

    // إرسال تحديث عبر Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('driver:status:changed', {
        driverId: driver._id,
        driverName: driver.name,
        isAvailable: driver.driverInfo.isAvailable,
        isOnline: driver.isOnline,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: finalStatus ? "أنت الآن متاح للطلبات" : "أنت الآن غير متاح",
      data: {
        isAvailable: driver.driverInfo.isAvailable,
        isOnline: driver.isOnline,
        lastStatusUpdate: driver.lastStatusUpdate
      }
    });
  } catch (error) {
    console.error("❌ Toggle availability error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث حالة التوفر"
    });
  }
};

/**
 * @desc    تحديث الموقع الحالي
 * @route   PUT /api/driver/me/location
 * @access  Driver
 */
exports.updateLocation = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required"
      });
    }

    await User.findByIdAndUpdate(driverId, {
      'driverInfo.currentLocation': {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      }
    });

    await DriverLocation.findOneAndUpdate(
      { driver: driverId },
      {
        driver: driverId,
        location: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        },
        createdAt: new Date()
      },
      { upsert: true, new: true }
    );

    const activeOrders = await Order.find({
      driver: driverId,
      status: { $in: ['accepted', 'picked'] }
    });

    const io = req.app.get('io');
    if (io) {
      activeOrders.forEach(order => {
        io.to(`order:${order._id}`).emit('driver:location:updated', {
          orderId: order._id,
          driverId,
          location: { latitude, longitude },
          timestamp: new Date()
        });
      });
    }

    res.json({
      success: true,
      message: "Location updated successfully",
      data: {
        latitude,
        longitude,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error("❌ Update location error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update location"
    });
  }
};

/**
 * @desc    الحصول على الطلب الحالي
 * @route   GET /api/driver/me/current-order
 * @access  Driver
 */
exports.getCurrentOrder = async (req, res) => {
  try {
    const driverId = req.user.id;

    const currentOrder = await Order.findOne({
      driver: driverId,
      status: { $in: ['accepted', 'picked'] }
    })
      .populate('user', 'name phone image')
      .populate('store', 'name image phone addressLine')
      .populate('pickupAddress')
      .populate('deliveryAddress')
      .populate('items.item')
      .lean();

    if (!currentOrder) {
      return res.json({
        success: true,
        data: null,
        message: "No active order"
      });
    }

    const orderData = {
      ...currentOrder,
      statusText: getStatusText(currentOrder.status),
      estimatedDelivery: calculateETA(currentOrder),
      timeline: createOrderTimeline(currentOrder)
    };

    res.json({
      success: true,
      data: orderData
    });
  } catch (error) {
    console.error("❌ Get current order error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get current order"
    });
  }
};

/**
 * @desc    الحصول على إحصائيات المندوب
 * @route   GET /api/driver/me/stats
 * @access  Driver
 */
exports.getMyStats = async (req, res) => {
  try {
    const driverId = req.user.id;

    const cacheKey = `driver:stats:${driverId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [
      todayStats,
      weekStats,
      monthStats,
      totalStats,
      recentOrders
    ] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            driver: driverId,
            status: 'delivered',
            createdAt: { $gte: today }
          }
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            earnings: { $sum: { $multiply: ['$totalPrice', 0.8] } },
            distance: { $sum: '$distance' || 0 }
          }
        }
      ]),

      Order.aggregate([
        {
          $match: {
            driver: driverId,
            status: 'delivered',
            createdAt: { $gte: weekAgo }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            orders: { $sum: 1 },
            earnings: { $sum: { $multiply: ['$totalPrice', 0.8] } }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      Order.aggregate([
        {
          $match: {
            driver: driverId,
            status: 'delivered',
            createdAt: { $gte: monthAgo }
          }
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            earnings: { $sum: { $multiply: ['$totalPrice', 0.8] } },
            avgTime: { $avg: '$deliveryTime' }
          }
        }
      ]),

      User.findById(driverId).select('driverInfo'),

      Order.find({ driver: driverId, status: 'delivered' })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('totalPrice createdAt')
        .lean()
    ]);

    const stats = {
      today: {
        orders: todayStats[0]?.orders || 0,
        earnings: todayStats[0]?.earnings || 0,
        distance: todayStats[0]?.distance || 0
      },
      week: {
        daily: weekStats,
        total: weekStats.reduce((sum, day) => sum + day.orders, 0),
        earnings: weekStats.reduce((sum, day) => sum + day.earnings, 0)
      },
      month: {
        orders: monthStats[0]?.orders || 0,
        earnings: monthStats[0]?.earnings || 0,
        avgTime: monthStats[0]?.avgTime || 0
      },
      total: {
        orders: totalStats?.driverInfo?.totalDeliveries || 0,
        earnings: totalStats?.driverInfo?.earnings || 0,
        rating: totalStats?.driverInfo?.rating || 0
      },
      recentOrders
    };

    cache.set(cacheKey, stats, 300);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error("❌ Get driver stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get statistics"
    });
  }
};

// ========== 3. دوال المندوبين (للأدمن) ==========

/**
 * @desc    الحصول على جميع المندوبين
 * @route   GET /api/driver
 * @access  Admin
 */
exports.getDrivers = async (req, res) => {
  try {
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;

    let query = { role: 'driver' };

    if (filters.isAvailable !== undefined) {
      query['driverInfo.isAvailable'] = filters.isAvailable === 'true';
    }

    if (filters.isOnline !== undefined) {
      query.isOnline = filters.isOnline === 'true';
    }

    if (filters.minRating) {
      query['driverInfo.rating'] = { $gte: Number(filters.minRating) };
    }

    const [drivers, total] = await Promise.all([
      User.find(query)
        .select('name phone image email driverInfo isOnline lastLogin')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments(query)
    ]);

    const driversWithStats = await Promise.all(
      drivers.map(async (driver) => {
        const todayOrders = await Order.countDocuments({
          driver: driver._id,
          status: 'delivered',
          createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
        });

        return {
          ...driver,
          todayOrders
        };
      })
    );

    const response = PaginationUtils.createPaginationResponse(
      driversWithStats,
      total,
      paginationOptions,
      {
        available: await User.countDocuments({ role: 'driver', 'driverInfo.isAvailable': true }),
        online: await User.countDocuments({ role: 'driver', isOnline: true })
      }
    );

    res.json(response);
  } catch (error) {
    console.error("❌ Get drivers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get drivers"
    });
  }
};

/**
 * @desc    الحصول على موقع مندوب معين
 * @route   GET /api/driver/:id/location
 * @access  Admin / Client
 */
exports.getDriverLocation = async (req, res) => {
  try {
    const { id } = req.params;

    const location = await DriverLocation.findOne({ driver: id })
      .sort({ createdAt: -1 })
      .lean();

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Driver location not found"
      });
    }

    res.json({
      success: true,
      data: {
        driverId: id,
        location: {
          latitude: location.location.coordinates[1],
          longitude: location.location.coordinates[0]
        },
        updatedAt: location.createdAt
      }
    });
  } catch (error) {
    console.error("❌ Get driver location error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get driver location"
    });
  }
};

/**
 * @desc    الحصول على إحصائيات مندوب معين (للأدمن)
 * @route   GET /api/driver/:id/stats
 * @access  Admin
 */
exports.getDriverStatsById = async (req, res) => {
  try {
    const { id } = req.params;

    const driver = await User.findById(id)
      .select('name phone email driverInfo stats')
      .lean();

    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    const [orders, earnings] = await Promise.all([
      Order.aggregate([
        { $match: { driver: id, status: 'delivered' } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 },
            revenue: { $sum: '$totalPrice' }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 6 }
      ]),

      Order.aggregate([
        { $match: { driver: id, status: 'delivered' } },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalPrice' },
            avg: { $avg: '$totalPrice' },
            min: { $min: '$totalPrice' },
            max: { $max: '$totalPrice' }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      data: {
        driver,
        monthlyStats: orders,
        earnings: earnings[0] || { total: 0, avg: 0, min: 0, max: 0 }
      }
    });
  } catch (error) {
    console.error("❌ Get driver stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get driver statistics"
    });
  }
};

// ========== 4. دوال مساعدة ==========

const getStatusText = (status) => {
  const statusTexts = {
    pending: 'قيد الانتظار',
    accepted: 'تم القبول',
    picked: 'تم الاستلام',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي'
  };
  return statusTexts[status] || 'غير معروف';
};

const calculateETA = (order) => {
  if (!order) return 'غير معروف';

  const now = new Date();
  const created = new Date(order.createdAt);
  const elapsedMinutes = Math.floor((now - created) / 60000);

  const baseTime = order.estimatedDeliveryTime || 30;
  const remaining = Math.max(0, baseTime - elapsedMinutes);

  const statusTimes = {
    pending: `${baseTime} دقيقة`,
    accepted: `${Math.max(5, remaining)} دقيقة`,
    picked: `${Math.max(2, remaining - 10)} دقيقة`,
    delivered: 'تم التوصيل',
    cancelled: 'ملغي'
  };

  return statusTimes[order.status] || 'قيد الحساب';
};

const createOrderTimeline = (order) => {
  return [
    {
      status: 'created',
      title: 'تم إنشاء الطلب',
      timestamp: order.createdAt,
      completed: true,
      icon: '🛒'
    },
    {
      status: 'accepted',
      title: 'تم قبول الطلب',
      timestamp: order.status !== 'pending' ? order.updatedAt : null,
      completed: ['accepted', 'picked', 'delivered'].includes(order.status),
      icon: '✅'
    },
    {
      status: 'picked',
      title: 'تم الاستلام من المطعم',
      timestamp: ['picked', 'delivered'].includes(order.status) ? order.updatedAt : null,
      completed: ['picked', 'delivered'].includes(order.status),
      icon: '📦'
    },
    {
      status: 'delivered',
      title: 'تم التوصيل',
      timestamp: order.status === 'delivered' ? order.updatedAt : null,
      completed: order.status === 'delivered',
      icon: '🚚'
    }
  ];
};

/**
 * @desc    الحصول على مندوب محدد (للأدمن)
 */
exports.getDriverById = async (req, res) => {
  try {
    const { id } = req.params;

    const driver = await User.findById(id)
      .select('name phone email image driverInfo stats isOnline lastLogin')
      .lean();

    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({
        success: false,
        message: "المندوب غير موجود"
      });
    }

    res.json({
      success: true,
      data: driver
    });
  } catch (error) {
    console.error("❌ Get driver by id error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب بيانات المندوب"
    });
  }
};

/**
 * @desc    تحديث الصورة الشخصية للمندوب
 * @route   PUT /api/v1/driver/profile/avatar
 * @access  Driver
 */
exports.updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "لم يتم رفع أي صورة"
      });
    }

    const driverId = req.user.id;

    const oldDriver = await User.findById(driverId).select('image');
    if (oldDriver?.image) {
      const oldPublicId = fileService.extractPublicIdFromUrl(oldDriver.image);
      if (oldPublicId) {
        fileService.deleteFile(oldPublicId).catch(err =>
          console.error('Error deleting old avatar:', err)
        );
      }
    }

    const driver = await User.findByIdAndUpdate(
      driverId,
      { image: req.file.path },
      { new: true }
    ).select('name phone image');

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "المندوب غير موجود"
      });
    }

    invalidateDriverCache(driverId);

    res.json({
      success: true,
      message: "تم تحديث الصورة الشخصية بنجاح",
      data: {
        image: driver.image,
        optimized: req.file.thumbnail || null
      }
    });
  } catch (error) {
    console.error("❌ Update avatar error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث الصورة الشخصية"
    });
  }
};

/**
 * @desc    الحصول على سجل الأرباح
 * @route   GET /api/v1/driver/earnings/history
 * @access  Driver
 */
exports.getEarningsHistory = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { page = 1, limit = 20, from, to } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let dateQuery = {};
    if (from || to) {
      dateQuery = {};
      if (from) dateQuery.$gte = new Date(from);
      if (to) dateQuery.$lte = new Date(to);
    }

    const orders = await Order.find({
      driver: driverId,
      status: 'delivered',
      ...(Object.keys(dateQuery).length > 0 ? { deliveredAt: dateQuery } : {})
    })
      .select('totalPrice deliveredAt items store')
      .populate('store', 'name')
      .sort({ deliveredAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Order.countDocuments({
      driver: driverId,
      status: 'delivered',
      ...(Object.keys(dateQuery).length > 0 ? { deliveredAt: dateQuery } : {})
    });

    const earnings = orders.map(order => ({
      orderId: order._id,
      storeName: order.store?.name || 'غير معروف',
      date: order.deliveredAt,
      amount: order.totalPrice,
      commission: order.totalPrice * 0.2,
      netEarnings: order.totalPrice * 0.8,
      itemsCount: order.items?.reduce((sum, item) => sum + item.qty, 0) || 0
    }));

    const stats = {
      totalEarnings: earnings.reduce((sum, e) => sum + e.netEarnings, 0),
      totalOrders: earnings.length,
      averagePerOrder: earnings.length > 0
        ? earnings.reduce((sum, e) => sum + e.netEarnings, 0) / earnings.length
        : 0,
      totalCommission: earnings.reduce((sum, e) => sum + e.commission, 0)
    };

    const monthlyStats = await Order.aggregate([
      {
        $match: {
          driver: driverId,
          status: 'delivered',
          ...(Object.keys(dateQuery).length > 0 ? { deliveredAt: dateQuery } : {})
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$deliveredAt" },
            month: { $month: "$deliveredAt" }
          },
          earnings: { $sum: { $multiply: ["$totalPrice", 0.8] } },
          orders: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 }
    ]);

    res.json({
      success: true,
      data: {
        earnings,
        monthlyStats,
        stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error("❌ Get earnings history error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب سجل الأرباح"
    });
  }
};

/**
 * @desc    الحصول على تقرير الأداء
 * @route   GET /api/v1/driver/performance
 * @access  Driver
 */
exports.getPerformanceReport = async (req, res) => {
  try {
    const driverId = req.user.id;

    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const weekAgo = new Date(now.setDate(now.getDate() - 7));
    const monthAgo = new Date(now.setMonth(now.getMonth() - 1));

    const [
      dailyStats,
      weeklyStats,
      monthlyStats,
      deliveryTimes,
      ratings
    ] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            driver: driverId,
            status: 'delivered',
            deliveredAt: { $gte: today }
          }
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            earnings: { $sum: { $multiply: ["$totalPrice", 0.8] } },
            totalDistance: { $sum: "$estimatedDistance" }
          }
        }
      ]),

      Order.aggregate([
        {
          $match: {
            driver: driverId,
            status: 'delivered',
            deliveredAt: { $gte: weekAgo }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$deliveredAt" } },
            orders: { $sum: 1 },
            earnings: { $sum: { $multiply: ["$totalPrice", 0.8] } }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      Order.aggregate([
        {
          $match: {
            driver: driverId,
            status: 'delivered',
            deliveredAt: { $gte: monthAgo }
          }
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            earnings: { $sum: { $multiply: ["$totalPrice", 0.8] } },
            avgOrderValue: { $avg: "$totalPrice" }
          }
        }
      ]),

      Order.aggregate([
        {
          $match: {
            driver: driverId,
            status: 'delivered',
            deliveryTime: { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            avgDeliveryTime: { $avg: "$deliveryTime" },
            fastestDelivery: { $min: "$deliveryTime" },
            slowestDelivery: { $max: "$deliveryTime" },
            totalDeliveries: { $sum: 1 }
          }
        }
      ]),

      User.findById(driverId).select('driverInfo.rating driverInfo.totalRatings')
    ]);

    const acceptedOrders = await Order.countDocuments({
      driver: driverId,
      status: { $in: ['accepted', 'picked', 'delivered'] }
    });

    const rejectedOrders = await Order.countDocuments({
      driver: driverId,
      status: 'cancelled',
      cancelledBy: driverId
    });

    const acceptanceRate = acceptedOrders + rejectedOrders > 0
      ? (acceptedOrders / (acceptedOrders + rejectedOrders)) * 100
      : 100;

    res.json({
      success: true,
      data: {
        period: {
          today: dailyStats[0] || { orders: 0, earnings: 0, totalDistance: 0 },
          weekly: {
            daily: weeklyStats,
            total: weeklyStats.reduce((sum, day) => sum + day.orders, 0),
            earnings: weeklyStats.reduce((sum, day) => sum + day.earnings, 0)
          },
          monthly: monthlyStats[0] || { orders: 0, earnings: 0, avgOrderValue: 0 }
        },
        performance: {
          acceptanceRate: acceptanceRate.toFixed(1),
          deliveryTime: deliveryTimes[0] || {
            avgDeliveryTime: 0,
            fastestDelivery: 0,
            slowestDelivery: 0
          },
          rating: ratings?.driverInfo?.rating || 0,
          totalRatings: ratings?.driverInfo?.totalRatings || 0
        },
        summary: {
          totalDeliveries: acceptedOrders,
          totalEarnings: monthlyStats[0]?.earnings || 0,
          averagePerDay: weeklyStats.length > 0
            ? weeklyStats.reduce((sum, day) => sum + day.orders, 0) / weeklyStats.length
            : 0
        }
      }
    });
  } catch (error) {
    console.error("❌ Get performance report error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب تقرير الأداء"
    });
  }
};

/**
 * @desc    توثيق مندوب (للمشرفين)
 * @route   PUT /api/v1/admin/drivers/:id/verify
 * @access  Admin
 */
exports.verifyDriver = async (req, res) => {
  try {
    const { id } = req.params;

    const driver = await User.findByIdAndUpdate(
      id,
      {
        isVerified: true,
        'driverInfo.documents.$[].verified': true
      },
      { new: true }
    ).select('name phone email driverInfo isVerified');

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "المندوب غير موجود"
      });
    }

    res.json({
      success: true,
      message: "تم توثيق المندوب بنجاح",
      data: {
        id: driver._id,
        isVerified: driver.isVerified,
        driverInfo: driver.driverInfo
      }
    });
  } catch (error) {
    console.error("❌ Verify driver error:", error);
    res.status(500).json({
      success: false,
      message: "فشل توثيق المندوب"
    });
  }
};

/**
 * @desc    تغيير حالة المندوب (تفعيل/تعطيل)
 * @route   PUT /api/v1/admin/drivers/:id/status
 * @access  Admin
 */
exports.toggleDriverStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const driver = await User.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    ).select('name phone email isActive');

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "المندوب غير موجود"
      });
    }

    res.json({
      success: true,
      message: `تم ${isActive ? 'تفعيل' : 'تعطيل'} المندوب بنجاح`,
      data: {
        id: driver._id,
        isActive: driver.isActive
      }
    });
  } catch (error) {
    console.error("❌ Toggle driver status error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تغيير حالة المندوب"
    });
  }
};

/**
 * @desc    الحصول على الموقع الحالي للمندوب
 * @route   GET /api/v1/driver/location/current
 * @access  Driver
 */
exports.getCurrentLocation = async (req, res) => {
  try {
    const driverId = req.user.id;
    
    const location = await DriverLocation.findOne({ driver: driverId })
      .sort({ createdAt: -1 })
      .lean();
    
    if (!location) {
      return res.json({
        success: true,
        data: null,
        message: "لا يوجد موقع مسجل حالياً"
      });
    }
    
    res.json({
      success: true,
      data: {
        driverId,
        location: {
          latitude: location.location.coordinates[1],
          longitude: location.location.coordinates[0]
        },
        accuracy: location.accuracy,
        speed: location.speed,
        heading: location.heading,
        updatedAt: location.createdAt
      }
    });
  } catch (error) {
    console.error("❌ Get current location error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب الموقع الحالي"
    });
  }
};

module.exports = exports;