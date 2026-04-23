// ============================================
// ملف: src/controllers/driver.controller.js
// الوصف: إدارة عمليات المندوبين
// الإصدار: 2.0 (تم الإصلاح الكامل)
// التعديلات: فصل حالة الاتصال عن حالة التوفر، تحسين APIs المشرفين
// ============================================

const { User, Order, DriverLocation } = require('../models');
const cache = require("../utils/cache.util");
const PaginationUtils = require('../utils/pagination.util');
const fileService = require('../services/file.service');
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة ==========

const getStatusText = (status) => {
  const statusMap = {
    pending: 'قيد الانتظار',
    accepted: 'تم القبول',
    ready: 'جاهز',
    picked: 'تم الاستلام',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي'
  };
  return statusMap[status] || status;
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
    ready: `${Math.max(2, remaining - 5)} دقيقة`,
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
      completed: ['accepted', 'ready', 'picked', 'delivered'].includes(order.status),
      icon: '✅'
    },
    {
      status: 'ready',
      title: 'الطلب جاهز',
      timestamp: order.status === 'ready' ? order.updatedAt : null,
      completed: ['ready', 'picked', 'delivered'].includes(order.status),
      icon: '🍽️'
    },
    {
      status: 'picked',
      title: 'تم الاستلام من المتجر',
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

const invalidateDriverCache = (driverId) => {
  cache.del(`driver:profile:${driverId}`);
  cache.del(`driver:stats:${driverId}`);
  cache.invalidatePattern(`driver:orders:${driverId}:*`);
  cache.del(`driver:status:${driverId}`);
  cache.del(`user:complete:${driverId}`);
};

/**
 * الحصول على نص حالة المندوب بالعربية
 */
const getDriverStatusText = (driver) => {
  if (driver.currentOrder) return 'مشغول (في توصيلة)';
  if (driver.isOnline && driver.isAvailable) return 'متاح ✅';
  if (driver.isOnline && !driver.isAvailable) return 'غير متاح ⛔';
  return 'غير متصل 📴';
};

/**
 * تسجيل تاريخ تغيير الحالة
 */
const logDriverStatusChange = async (driverId, oldStatus, newStatus, reason = null) => {
  try {
    await User.findByIdAndUpdate(driverId, {
      $push: {
        'driverInfo.statusHistory': {
          oldStatus,
          newStatus,
          changedAt: new Date(),
          reason: reason || null
        }
      },
      'driverInfo.lastAvailableChange': new Date()
    });
  } catch (error) {
    console.error('❌ Error logging driver status change:', error);
  }
};

// ========== 2. دوال المندوب الحالي ==========

/**
 * @desc    الحصول على ملف المندوب الشخصي
 * @route   GET /api/v1/driver/profile
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
      .select('name phone image email driverInfo isOnline lastLogin')
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
        status: { $in: ['accepted', 'ready', 'picked'] }
      }).select('_id status pickupAddress deliveryAddress')
    ]);

    const profileData = {
      ...driver,
      stats: {
        todayOrders,
        totalEarnings: totalEarnings[0]?.total || 0,
        currentOrder: currentOrder || null
      },
      statusDisplay: getDriverStatusText({
        isOnline: driver.isOnline,
        isAvailable: driver.driverInfo?.isAvailable,
        currentOrder: currentOrder
      })
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
 * @desc    الحصول على حالة المندوب التفصيلية
 * @route   GET /api/v1/driver/status
 * @access  Driver
 */
exports.getMyDetailedStatus = async (req, res) => {
  try {
    const driverId = req.user.id;

    const cacheKey = `driver:status:${driverId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const driver = await User.findById(driverId)
      .select('driverInfo.isAvailable isOnline driverInfo.lastAvailableChange driverInfo.statusHistory')
      .lean();

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    const currentOrder = await Order.findOne({
      driver: driverId,
      status: { $in: ['accepted', 'ready', 'picked'] }
    }).select('_id status');

    const statusData = {
      isOnline: driver.isOnline,
      isAvailable: driver.driverInfo?.isAvailable || false,
      hasActiveOrder: !!currentOrder,
      currentOrder: currentOrder || null,
      statusText: getDriverStatusText({
        isOnline: driver.isOnline,
        isAvailable: driver.driverInfo?.isAvailable,
        currentOrder: currentOrder
      }),
      lastAvailableChange: driver.driverInfo?.lastAvailableChange || null,
      statusHistory: (driver.driverInfo?.statusHistory || []).slice(-10)
    };

    cache.set(cacheKey, statusData, 30);

    res.json({
      success: true,
      data: statusData
    });
  } catch (error) {
    console.error("❌ Get driver detailed status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get driver status"
    });
  }
};

/**
 * @desc    تبديل حالة التوفر فقط (متاح/غير متاح للطلبات)
 * @route   PUT /api/v1/driver/availability
 * @access  Driver
 */
exports.toggleAvailability = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { isAvailable } = req.body;

    if (isAvailable === undefined) {
      return res.status(400).json({
        success: false,
        message: "حقل isAvailable مطلوب"
      });
    }

    console.log(`🔄 Driver ${driverId} toggling availability to: ${isAvailable}`);

    // الحصول على الحالة القديمة لتسجيل التغيير
    const oldDriver = await User.findById(driverId).select('driverInfo.isAvailable');
    const oldStatus = oldDriver?.driverInfo?.isAvailable || false;

    // تحديث فقط isAvailable، لا نغير isOnline
    const driver = await User.findByIdAndUpdate(
      driverId,
      {
        'driverInfo.isAvailable': isAvailable,
        'driverInfo.lastAvailableChange': new Date()
      },
      { returnDocument: 'after' }
    ).select('driverInfo.isAvailable isOnline name phone');

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "المندوب غير موجود"
      });
    }

    // تسجيل تاريخ التغيير
    await logDriverStatusChange(driverId, oldStatus, isAvailable, 'manual_toggle');

    // إبطال الكاش
    invalidateDriverCache(driverId);

    // إرسال إشعار عبر Socket لجميع الأدمن والمندوب
    const io = req.app.get('io');
    if (io) {
      io.emit('driver:status:changed', {
        driverId: driver._id,
        driverName: driver.name,
        isAvailable: driver.driverInfo.isAvailable,
        isOnline: driver.isOnline,
        timestamp: new Date()
      });

      if (isAvailable === true) {
        io.to(`driver:${driverId}`).emit('driver:available:orders:refresh', {
          timestamp: new Date()
        });
      }
    }

    res.json({
      success: true,
      message: isAvailable ? "✅ أنت الآن متاح للطلبات" : "⛔ أنت الآن غير متاح للطلبات",
      data: {
        isAvailable: driver.driverInfo.isAvailable,
        isOnline: driver.isOnline,
        lastStatusUpdate: driver.driverInfo?.lastAvailableChange,
        driverInfo: {
          name: driver.name,
          phone: driver.phone
        }
      }
    });

  } catch (error) {
    console.error("❌ Toggle availability error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث حالة التوفر",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    تبديل حالة الاتصال فقط (متصل/غير متصل)
 * @route   PUT /api/v1/driver/online
 * @access  Driver
 */
exports.toggleOnline = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { isOnline } = req.body;

    if (isOnline === undefined) {
      return res.status(400).json({
        success: false,
        message: "حقل isOnline مطلوب"
      });
    }

    console.log(`🔄 Driver ${driverId} toggling online to: ${isOnline}`);

    const driver = await User.findByIdAndUpdate(
      driverId,
      { isOnline: isOnline },
      { returnDocument: 'after' }
    ).select('driverInfo.isAvailable isOnline name phone');

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "المندوب غير موجود"
      });
    }

    invalidateDriverCache(driverId);

    const io = req.app.get('io');
    if (io) {
      io.emit('driver:online:changed', {
        driverId: driver._id,
        driverName: driver.name,
        isOnline: driver.isOnline,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: isOnline ? "🟢 أنت الآن متصل" : "🔴 أنت الآن غير متصل",
      data: {
        isOnline: driver.isOnline,
        isAvailable: driver.driverInfo.isAvailable
      }
    });

  } catch (error) {
    console.error("❌ Toggle online error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث حالة الاتصال"
    });
  }
};

/**
 * @desc    تحديث موقع المندوب
 * @route   PUT /api/v1/driver/location
 * @access  Driver
 */
exports.updateLocation = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { latitude, longitude, orderId, accuracy, heading, speed } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required"
      });
    }

    if (isNaN(latitude) || isNaN(longitude) ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinates"
      });
    }

    console.log(`📍 Driver ${driverId} updating location: [${latitude}, ${longitude}]`);

    await User.findByIdAndUpdate(driverId, {
      'driverInfo.currentLocation': {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      },
      lastLocationUpdate: new Date()
    });

    const location = await DriverLocation.findOneAndUpdate(
      { driver: driverId },
      {
        driver: driverId,
        location: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        },
        order: orderId || null,
        accuracy: accuracy || null,
        heading: heading || null,
        speed: speed || null,
        createdAt: new Date()
      },
      { upsert: true, new: true }
    );

    const io = req.app.get('io');
    if (io) {
      // إرسال الموقع للطلب المحدد
      if (orderId) {
        io.to(`order:${orderId}`).emit('driver:location:updated', {
          orderId,
          driverId,
          location: { latitude, longitude },
          accuracy,
          heading,
          speed,
          timestamp: new Date()
        });
      }

      // إرسال الموقع للأدمن للمتابعة
      io.emit('driver:location:broadcast', {
        driverId,
        location: { latitude, longitude },
        orderId: orderId || null,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: "Location updated successfully",
      data: {
        location: { latitude, longitude },
        accuracy,
        heading,
        speed,
        timestamp: location.createdAt,
        orderId: orderId || null
      }
    });

  } catch (error) {
    console.error("❌ Update location error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update location",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    الحصول على موقع المندوب الحالي
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

/**
 * @desc    الحصول على الطلبات المتاحة للمندوبين
 * @route   GET /api/v1/driver/orders/available
 * @access  Driver
 */
exports.getAvailableOrders = async (req, res) => {
  try {
    const driverId = req.user.id;

    console.log(`🚚 Driver ${driverId} requesting available orders`);

    // جلب حالة المندوب الحالية
    const driver = await User.findById(driverId).select('driverInfo.isAvailable isOnline name phone');
    const isDriverAvailable = driver?.driverInfo?.isAvailable || false;
    const isDriverOnline = driver?.isOnline || false;

    console.log(`📊 Driver ${driverId} status: isAvailable=${isDriverAvailable}, isOnline=${isDriverOnline}`);

    // التحقق: يجب أن يكون المندوب متاحاً ومتصلاً
    if (!isDriverAvailable) {
      console.log(`⚠️ Driver ${driverId} is not available, returning empty orders`);
      return res.json({
        success: true,
        data: {
          orders: [],
          stats: { total: 0, byStore: {}, averageValue: 0 },
          timestamp: new Date(),
          driverStatus: {
            isAvailable: false,
            isOnline: isDriverOnline,
            reason: "غير متاح لاستقبال الطلبات"
          }
        }
      });
    }

    if (!isDriverOnline) {
      console.log(`⚠️ Driver ${driverId} is offline, returning empty orders`);
      return res.json({
        success: true,
        data: {
          orders: [],
          stats: { total: 0, byStore: {}, averageValue: 0 },
          timestamp: new Date(),
          driverStatus: {
            isAvailable: true,
            isOnline: false,
            reason: "يجب أن تكون متصلاً أولاً"
          }
        }
      });
    }

    // جلب الطلبات المتاحة
    const availableOrders = await Order.find({
      status: 'pending',
      $or: [
        { driver: { $exists: false } },
        { driver: null }
      ]
    })
      .populate('user', 'name phone')
      .populate('store', 'name image phone addressLine deliveryInfo')
      .populate('pickupAddress')
      .populate('deliveryAddress')
      .sort({ createdAt: 1 })
      .lean();

    console.log(`✅ Found ${availableOrders.length} available orders`);

    const formattedOrders = availableOrders.map(order => ({
      id: order._id,
      _id: order._id,
      store: {
        _id: order.store?._id,
        name: order.store?.name,
        image: order.store?.image,
        phone: order.store?.phone,
        addressLine: order.store?.addressLine,
        deliveryInfo: order.store?.deliveryInfo
      },
      items: order.items || [],
      totalPrice: order.totalPrice || 0,
      deliveryAddress: order.deliveryAddress ? {
        _id: order.deliveryAddress._id,
        addressLine: order.deliveryAddress.addressLine,
        city: order.deliveryAddress.city,
        latitude: order.deliveryAddress.latitude,
        longitude: order.deliveryAddress.longitude
      } : null,
      pickupAddress: order.pickupAddress ? {
        _id: order.pickupAddress._id,
        addressLine: order.pickupAddress.addressLine,
        city: order.pickupAddress.city
      } : null,
      status: order.status,
      statusText: getStatusText(order.status),
      createdAt: order.createdAt,
      notes: order.notes || '',
      paymentMethod: order.paymentMethod || 'cash',
      estimatedDeliveryTime: order.estimatedDeliveryTime || 30
    }));

    const stats = {
      total: formattedOrders.length,
      byStore: {},
      averageValue: formattedOrders.length > 0
        ? formattedOrders.reduce((sum, o) => sum + o.totalPrice, 0) / formattedOrders.length
        : 0
    };

    formattedOrders.forEach(order => {
      const storeId = order.store?._id?.toString() || 'unknown';
      if (!stats.byStore[storeId]) {
        stats.byStore[storeId] = {
          name: order.store?.name || 'Unknown',
          count: 0,
          totalValue: 0
        };
      }
      stats.byStore[storeId].count++;
      stats.byStore[storeId].totalValue += order.totalPrice;
    });

    res.json({
      success: true,
      data: {
        orders: formattedOrders,
        stats: stats,
        timestamp: new Date(),
        driverStatus: {
          isAvailable: true,
          isOnline: true,
          driverName: driver?.name,
          driverPhone: driver?.phone
        }
      }
    });

  } catch (error) {
    console.error('❌ Get available orders error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الطلبات المتاحة',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    الحصول على الطلب الحالي للمندوب
 * @route   GET /api/v1/driver/orders/active
 * @access  Driver
 */
exports.getCurrentOrder = async (req, res) => {
  try {
    const driverId = req.user.id;

    const currentOrder = await Order.findOne({
      driver: driverId,
      status: { $in: ['accepted', 'ready', 'picked'] }
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
        message: "لا يوجد طلب حالي"
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
      message: "فشل جلب الطلب الحالي"
    });
  }
};

/**
 * @desc    الحصول على إحصائيات المندوب
 * @route   GET /api/v1/driver/stats
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
            distance: { $sum: '$estimatedDistance' || 0 }
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
      message: "فشل جلب الإحصائيات"
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
      status: { $in: ['accepted', 'ready', 'picked', 'delivered'] }
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

// ========== 3. دوال المندوبين (للمشرفين) ==========

/**
 * @desc    الحصول على جميع المندوبين مع حالتهم التفصيلية
 * @route   GET /api/v1/admin/drivers/status
 * @access  Admin
 */
exports.getDriversStatusForAdmin = async (req, res) => {
  try {
    console.log('📍 Fetching drivers detailed status for admin...');

    const drivers = await User.find({ role: 'driver', isActive: true })
      .select('name phone email image driverInfo isOnline isActive isVerified createdAt updatedAt')
      .lean();

    const driversWithDetails = await Promise.all(drivers.map(async (driver) => {
      // التحقق من الطلب الحالي
      const currentOrder = await Order.findOne({
        driver: driver._id,
        status: { $in: ['accepted', 'ready', 'picked'] }
      }).select('_id status');

      // آخر موقع معروف
      const lastLocation = await DriverLocation.findOne({ driver: driver._id })
        .sort({ createdAt: -1 })
        .select('location createdAt accuracy speed heading');

      return {
        _id: driver._id,
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        image: driver.image,
        isOnline: driver.isOnline,
        isActive: driver.isActive,
        isVerified: driver.isVerified,
        isAvailable: driver.driverInfo?.isAvailable || false,
        rating: driver.driverInfo?.rating || 0,
        totalDeliveries: driver.driverInfo?.totalDeliveries || 0,
        earnings: driver.driverInfo?.earnings || 0,
        currentOrder: currentOrder ? {
          id: currentOrder._id,
          status: currentOrder.status
        } : null,
        location: lastLocation ? {
          latitude: lastLocation.location.coordinates[1],
          longitude: lastLocation.location.coordinates[0],
          updatedAt: lastLocation.createdAt,
          accuracy: lastLocation.accuracy,
          speed: lastLocation.speed
        } : null,
        statusDisplay: getDriverStatusText({
          isOnline: driver.isOnline,
          isAvailable: driver.driverInfo?.isAvailable,
          currentOrder: currentOrder
        }),
        lastAvailableChange: driver.driverInfo?.lastAvailableChange || null,
        createdAt: driver.createdAt,
        updatedAt: driver.updatedAt
      };
    }));

    // إحصائيات سريعة
    const stats = {
      total: driversWithDetails.length,
      online: driversWithDetails.filter(d => d.isOnline).length,
      available: driversWithDetails.filter(d => d.isAvailable && d.isOnline && !d.currentOrder).length,
      busy: driversWithDetails.filter(d => d.currentOrder).length,
      offline: driversWithDetails.filter(d => !d.isOnline).length,
      unverified: driversWithDetails.filter(d => !d.isVerified).length
    };

    res.json({
      success: true,
      data: driversWithDetails,
      stats,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Get drivers status error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب حالة المندوبين',
      error: error.message
    });
  }
};

/**
 * @desc    الحصول على ملخص سريع لحالة المندوبين
 * @route   GET /api/v1/admin/drivers/status/summary
 * @access  Admin
 */
exports.getDriversSummary = async (req, res) => {
  try {
    const [
      total,
      online,
      available,
      busy,
      offline,
      avgRating,
      totalDeliveriesToday
    ] = await Promise.all([
      User.countDocuments({ role: 'driver', isActive: true }),
      User.countDocuments({ role: 'driver', isOnline: true, isActive: true }),
      User.countDocuments({
        role: 'driver',
        'driverInfo.isAvailable': true,
        isOnline: true,
        isActive: true
      }),
      Order.aggregate([
        {
          $match: {
            status: { $in: ['accepted', 'ready', 'picked'] },
            driver: { $exists: true }
          }
        },
        { $group: { _id: '$driver' } },
        { $count: 'count' }
      ]),
      User.countDocuments({ role: 'driver', isOnline: false, isActive: true }),
      User.aggregate([
        { $match: { role: 'driver', 'driverInfo.rating': { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$driverInfo.rating' } } }
      ]),
      Order.countDocuments({
        status: 'delivered',
        deliveredAt: { $gte: new Date().setHours(0, 0, 0, 0) },
        driver: { $exists: true }
      })
    ]);

    const busyCount = busy[0]?.count || 0;

    res.json({
      success: true,
      data: {
        total,
        online,
        available,
        busy: busyCount,
        offline,
        avgRating: avgRating[0]?.avg?.toFixed(1) || 0,
        totalDeliveriesToday,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('❌ Get drivers summary error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب ملخص حالة المندوبين'
    });
  }
};

/**
 * @desc    الحصول على جميع المندوبين (قائمة أساسية)
 * @route   GET /api/v1/admin/drivers
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
          todayOrders,
          statusDisplay: getDriverStatusText({
            isOnline: driver.isOnline,
            isAvailable: driver.driverInfo?.isAvailable,
            currentOrder: null
          })
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
 * @desc    الحصول على مندوب محدد
 * @route   GET /api/v1/admin/drivers/:id
 * @access  Admin
 */
exports.getDriverById = async (req, res) => {
  try {
    const { id } = req.params;

    const driver = await User.findById(id)
      .select('name phone email image driverInfo isOnline lastLogin')
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
 * @desc    الحصول على موقع مندوب معين
 * @route   GET /api/v1/admin/drivers/:id/location
 * @access  Admin
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
        updatedAt: location.createdAt,
        accuracy: location.accuracy,
        speed: location.speed
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
 * @desc    الحصول على إحصائيات مندوب معين
 * @route   GET /api/v1/admin/drivers/:id/stats
 * @access  Admin
 */
exports.getDriverStatsById = async (req, res) => {
  try {
    const { id } = req.params;

    const driver = await User.findById(id)
      .select('name phone email driverInfo')
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

/**
 * @desc    توثيق مندوب
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

    // إذا تم تعطيل المندوب، أغلق حساب المتجر تلقائياً
    if (!isActive && driver.storeVendorInfo?.store) {
      await Store.findByIdAndUpdate(driver.storeVendorInfo.store, {
        isOpen: false
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
 * @desc    جلب جميع المندوبين مع مواقعهم الحالية (للوحة التحكم)
 * @route   GET /api/v1/admin/drivers/locations
 * @access  Admin
 */
exports.getAllDriversWithLocations = async (req, res) => {
  try {
    console.log('📍 Fetching all drivers with locations...');

    const drivers = await User.find({ role: 'driver', isActive: true })
      .select('name phone email image driverInfo location isOnline isActive isVerified createdAt updatedAt')
      .lean();

    console.log(`✅ Found ${drivers.length} drivers`);

    const formattedDrivers = drivers.map(driver => ({
      _id: driver._id,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      image: driver.image,
      isOnline: driver.isOnline,
      isActive: driver.isActive,
      isVerified: driver.isVerified,
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
      rating: driver.driverInfo?.rating || 0,
      totalDeliveries: driver.driverInfo?.totalDeliveries || 0,
      earnings: driver.driverInfo?.earnings || 0,
      isAvailable: driver.driverInfo?.isAvailable || false,
      location: {
        coordinates: driver.driverInfo?.currentLocation?.coordinates || driver.location?.coordinates || null,
        updatedAt: driver.driverInfo?.currentLocation?.updatedAt || driver.updatedAt
      },
      driverInfo: driver.driverInfo
    }));

    res.json({
      success: true,
      data: formattedDrivers,
      count: formattedDrivers.length,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Error fetching drivers with locations:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب مواقع المندوبين',
      error: error.message
    });
  }
};

/**
 * @desc    فرض تحديث حالة المندوب بواسطة الأدمن
 * @route   PUT /api/v1/admin/drivers/:id/force-availability
 * @access  Admin
 */
exports.forceUpdateAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { isAvailable, reason } = req.body;

    if (isAvailable === undefined) {
      return res.status(400).json({
        success: false,
        message: "حقل isAvailable مطلوب"
      });
    }

    const oldDriver = await User.findById(id).select('driverInfo.isAvailable name');
    if (!oldDriver) {
      return res.status(404).json({
        success: false,
        message: "المندوب غير موجود"
      });
    }

    const driver = await User.findByIdAndUpdate(
      id,
      {
        'driverInfo.isAvailable': isAvailable,
        'driverInfo.lastAvailableChange': new Date()
      },
      { new: true }
    ).select('driverInfo.isAvailable isOnline name phone');

    await logDriverStatusChange(id, oldDriver.driverInfo?.isAvailable, isAvailable, reason || 'admin_override');

    const io = req.app.get('io');
    if (io) {
      io.emit('driver:status:force:changed', {
        driverId: id,
        driverName: driver.name,
        isAvailable: driver.driverInfo.isAvailable,
        forcedBy: req.user.id,
        reason: reason || 'تم التحديث بواسطة الأدمن',
        timestamp: new Date()
      });
    }

    invalidateDriverCache(id);

    res.json({
      success: true,
      message: `تم ${isAvailable ? 'تفعيل' : 'تعطيل'} توفر المندوب بنجاح`,
      data: {
        driverId: id,
        driverName: driver.name,
        isAvailable: driver.driverInfo.isAvailable,
        isOnline: driver.isOnline
      }
    });
  } catch (error) {
    console.error("❌ Force update availability error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث حالة المندوب"
    });
  }
};

module.exports = exports;