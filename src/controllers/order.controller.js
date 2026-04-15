// ============================================
// ملف: src/controllers/order.controller.js (مصحح بالكامل)
// الوصف: التحكم الكامل في عمليات الطلبات
// الإصدار: 4.0 (مصحح بالكامل مع دعم Product بدلاً من Item)
// ============================================

// ========== استيراد النماذج ==========
const { Order, User, Address, Store, DriverLocation, Review, Notification, StoreAddress } = require('../models');

const cache = require("../utils/cache.util");
const PaginationUtils = require('../utils/pagination.util');
const notificationService = require("../services/notification.service");
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة (Helpers) ==========

/**
 * تعيين أقرب سائق متاح للطلب
 */
const assignClosestDriver = async (orderId, pickupCoordinates) => {
  try {
    const nearestDriver = await DriverLocation.findOne({
      order: null
    }).where('location').near({
      center: {
        type: 'Point',
        coordinates: pickupCoordinates
      },
      maxDistance: 5000,
      spherical: true
    }).populate('driver', 'name phone image rating');

    if (!nearestDriver) {
      console.log('🚫 No available drivers found near pickup location');
      return null;
    }

    await Order.findByIdAndUpdate(orderId, {
      driver: nearestDriver.driver._id,
      status: "accepted",
    });

    await DriverLocation.findByIdAndUpdate(nearestDriver._id, {
      order: orderId
    });

    console.log(`✅ Driver ${nearestDriver.driver.name} assigned to order ${orderId}`);
    return nearestDriver.driver;
  } catch (error) {
    console.error('❌ Error assigning closest driver:', error.message);
    return null;
  }
};

/**
 * إبطال الكاش عند تحديث الطلب
 */
const invalidateOrderCache = async (orderId, userId) => {
  try {
    cache.del(`dashboard:${userId}`);
    cache.del(`user:complete:${userId}`);
    cache.del(`user:stats:${userId}`);
    cache.del(`order:tracking:${orderId}:${userId}`);
    cache.del(`order:full:${orderId}`);
    cache.invalidatePattern('orders:user:*');
    cache.invalidatePattern('orders:admin:*');
    cache.invalidatePattern('dashboard:*');
    console.log(`🗑️ Invalidated cache for order ${orderId}`);
  } catch (error) {
    console.error('❌ Cache invalidation error:', error);
  }
};

/**
 * حساب الوقت المقدر للتوصيل
 */
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
    ready: `${Math.max(2, remaining - 5)} دقيقة`,
    delivered: 'تم التوصيل',
    cancelled: 'ملغي'
  };

  return statusTimes[order.status] || 'قيد الحساب';
};

/**
 * الحصول على نص الحالة
 */
const getStatusText = (status) => {
  const statusTexts = {
    pending: 'قيد الانتظار',
    accepted: 'تم القبول',
    picked: 'تم الاستلام',
    ready: 'جاهز',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي'
  };
  return statusTexts[status] || 'غير معروف';
};

/**
 * التحقق من صحة تغيير الحالة
 */
const isValidStatusTransition = (oldStatus, newStatus, userRole) => {
  const validTransitions = {
    admin: {
      pending: ['accepted', 'cancelled', 'ready'],
      accepted: ['picked', 'cancelled', 'ready'],
      picked: ['delivered', 'cancelled'],
      ready: ['picked', 'cancelled'],
      delivered: [],
      cancelled: ['pending']
    },
    driver: {
      pending: [],
      accepted: ['picked'],
      picked: ['delivered'],
      ready: ['picked'],
      delivered: [],
      cancelled: []
    },
    client: {
      pending: ['cancelled'],
      accepted: ['cancelled'],
      picked: [],
      ready: [],
      delivered: [],
      cancelled: []
    }
  };

  const roleTransitions = validTransitions[userRole] || validTransitions.client;
  return roleTransitions[oldStatus]?.includes(newStatus) || false;
};

/**
 * إنشاء Timeline للطلب
 */
const createOrderTimeline = (order) => {
  return [
    {
      status: 'created',
      title: 'تم إنشاء الطلب',
      description: 'تم استلام طلبك بنجاح',
      timestamp: order.createdAt,
      completed: true,
      icon: '🛒'
    },
    {
      status: 'accepted',
      title: 'تم قبول الطلب',
      description: order.driver ? 'تم تعيين مندوب' : 'بانتظار قبول المتجر',
      timestamp: order.status !== 'pending' ? order.updatedAt : null,
      completed: ['accepted', 'ready', 'picked', 'delivered'].includes(order.status),
      icon: '✅'
    },
    {
      status: 'ready',
      title: 'الطلب جاهز',
      description: 'الطلب جاهز للاستلام من المتجر',
      timestamp: order.status === 'ready' ? order.updatedAt : null,
      completed: ['ready', 'picked', 'delivered'].includes(order.status),
      icon: '🍽️'
    },
    {
      status: 'picked',
      title: 'تم الاستلام من المتجر',
      description: 'المندوب في طريقه إليك',
      timestamp: ['picked', 'delivered'].includes(order.status) ? order.updatedAt : null,
      completed: ['picked', 'delivered'].includes(order.status),
      icon: '📦'
    },
    {
      status: 'delivered',
      title: 'تم التوصيل',
      description: 'تم توصيل طلبك بنجاح',
      timestamp: order.status === 'delivered' ? order.updatedAt : null,
      completed: order.status === 'delivered',
      icon: '🚚'
    }
  ];
};

// ========== 2. دوال إنشاء الطلبات ==========

/**
 * @desc    إنشاء طلب جديد
 * @route   POST /api/v1/client/orders
 * @access  Client
 */
exports.createOrder = async (req, res) => {
  try {
    const { items, pickupAddress, deliveryAddress, store, notes, paymentMethod } = req.body;
    const userId = req.user.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "يجب إضافة عناصر للطلب"
      });
    }

    if (!pickupAddress || !deliveryAddress) {
      return res.status(400).json({
        success: false,
        message: "عنوان الاستلام والتوصيل مطلوبان"
      });
    }

    if (!store) {
      return res.status(400).json({
        success: false,
        message: "المتجر مطلوب"
      });
    }

    let calculatedTotalPrice = 0;
    const validatedItems = [];

    for (const item of items) {
      if (!item.name || !item.qty || !item.price) {
        return res.status(400).json({
          success: false,
          message: "بيانات العناصر غير مكتملة"
        });
      }

      const qty = Number(item.qty);
      const price = Number(item.price);

      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({
          success: false,
          message: `الكمية غير صالحة للمنتج ${item.name}`
        });
      }

      if (isNaN(price) || price < 0) {
        return res.status(400).json({
          success: false,
          message: `السعر غير صالح للمنتج ${item.name}`
        });
      }

      calculatedTotalPrice += price * qty;

      validatedItems.push({
        name: item.name,
        qty: qty,
        price: price,
        item: item.item || null,
        notes: item.notes || '',
        category: item.category || '',
      });
    }

    if (calculatedTotalPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "السعر الإجمالي غير صالح"
      });
    }

    console.log(`💰 Calculated total price: ${calculatedTotalPrice}`);

    // التحقق من عنوان التوصيل
    const delivery = await Address.findOne({ _id: deliveryAddress, user: userId });

    if (!delivery) {
      return res.status(400).json({
        success: false,
        message: "عنوان التوصيل غير صالح أو لا تملك صلاحية الوصول إليه"
      });
    }

    // التحقق من عنوان الاستلام
    let pickup = null;
    pickup = await StoreAddress.findOne({ _id: pickupAddress });

    if (!pickup) {
      pickup = await Store.findById(pickupAddress).select('name address location');
    }

    if (!pickup) {
      pickup = { _id: pickupAddress, name: 'عنوان المتجر', addressLine: 'عنوان المتجر' };
    }

    console.log('✅ Addresses validated:', {
      deliveryAddress: delivery.addressLine,
      pickupAddress: pickup.addressLine || pickup.name || pickup._id
    });

    const storeInfo = await Store.findById(store);
    if (!storeInfo) {
      return res.status(404).json({
        success: false,
        message: "المتجر غير موجود"
      });
    }

    if (!storeInfo.isOpen) {
      return res.status(400).json({
        success: false,
        message: "المتجر مغلق حالياً"
      });
    }

    const order = await Order.create({
      user: userId,
      items: validatedItems,
      totalPrice: calculatedTotalPrice,
      pickupAddress,
      deliveryAddress: delivery._id,
      store,
      status: "pending",
      notes: notes?.trim() || '',
      paymentMethod: paymentMethod || 'cash',
      estimatedDeliveryTime: storeInfo.deliveryInfo?.estimatedDeliveryTime || 30
    });

    console.log(`✅ Order created: ${order._id} with total ${calculatedTotalPrice}`);

    let assignedDriver = null;
    if (delivery.latitude && delivery.longitude) {
      assignedDriver = await assignClosestDriver(
        order._id,
        [delivery.longitude, delivery.latitude]
      );
    }

    try {
      await notificationService.createOrderNotifications(order);
    } catch (notificationError) {
      console.error('❌ Notification error:', notificationError.message);
    }

    await User.findByIdAndUpdate(userId, {
      $inc: { 'stats.totalOrders': 1 },
      $set: { 'stats.lastOrderDate': new Date() }
    });

    const populatedOrder = await Order.findById(order._id)
      .populate("user", "name phone image")
      .populate("driver", "name phone image rating")
      .populate("store", "name image phone deliveryInfo")
      .populate("pickupAddress")
      .populate("deliveryAddress")
      .lean();

    await invalidateOrderCache(order._id, userId);

    res.status(201).json({
      success: true,
      message: "تم إنشاء الطلب بنجاح",
      data: {
        order: populatedOrder,
        calculatedTotal: calculatedTotalPrice,
        assignedDriver: assignedDriver ? {
          id: assignedDriver._id,
          name: assignedDriver.name,
          phone: assignedDriver.phone,
          rating: assignedDriver.rating
        } : null,
        timeline: createOrderTimeline(populatedOrder),
        estimatedDelivery: calculateETA(populatedOrder),
        nextSteps: assignedDriver ? "جاري تجهيز الطلب" : "بانتظار تعيين مندوب"
      },
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ Create order error:', error.message);
    console.error('Stack:', error.stack);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "بيانات الطلب غير صالحة",
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إنشاء الطلب",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ========== 3. دوال جلب الطلبات ==========

/**
 * @desc    الحصول على تفاصيل الطلب (موحد)
 * @route   GET /api/v1/orders/:id
 * @access  Authenticated (Vendor, Driver, Admin)
 */
exports.getOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const cacheKey = `order:full:${id}:${userId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData && cachedData.userId === userId) {
      console.log(`📦 Serving order ${id} from cache`);
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    // ✅ استخدام Product بدلاً من Item
    const order = await Order.findById(id)
      .populate('user', 'name phone email image')
      .populate('driver', 'name phone email image rating totalDeliveries')
      .populate('store', 'name image phone addressLine deliveryInfo')
      .populate('pickupAddress')
      .populate('deliveryAddress')
      .populate({
        path: 'items.item',
        model: 'Product',
        select: 'name price image description category isAvailable',
        options: { strictPopulate: false }
      })
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود'
      });
    }

    const isVendor = order.user && order.user._id.toString() === userId;
    const isDriver = order.driver && order.driver._id.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (!isVendor && !isDriver && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بالوصول إلى هذا الطلب'
      });
    }

    // معالجة items
    const processedItems = (order.items || []).map(item => ({
      id: item._id,
      name: item.name,
      quantity: item.qty,
      price: item.price,
      totalPrice: (item.price || 0) * (item.qty || 0),
      notes: item.notes || '',
      category: item.category || '',
      options: item.options || [],
      product: item.item ? {
        id: item.item._id,
        name: item.item.name,
        price: item.item.price,
        image: item.item.image,
        description: item.item.description
      } : null
    }));

    let driverLocation = null;
    let locationHistory = [];

    if (order.driver && ['accepted', 'ready', 'picked'].includes(order.status)) {
      try {
        const locationData = await DriverLocation.findOne({
          driver: order.driver._id,
          order: order._id
        }).lean();

        if (locationData && locationData.location && locationData.location.coordinates) {
          driverLocation = {
            latitude: locationData.location.coordinates[1],
            longitude: locationData.location.coordinates[0],
            updatedAt: locationData.createdAt,
            accuracy: locationData.accuracy,
            speed: locationData.speed
          };
        }

        const history = await DriverLocation.find({
          driver: order.driver._id,
          order: order._id,
          createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
        })
          .select('location createdAt')
          .sort({ createdAt: 1 })
          .limit(20)
          .lean();

        locationHistory = history
          .filter(h => h.location && h.location.coordinates)
          .map(loc => ({
            latitude: loc.location.coordinates[1],
            longitude: loc.location.coordinates[0],
            timestamp: loc.createdAt
          }));
      } catch (locError) {
        console.log('⚠️ Error fetching driver location:', locError.message);
      }
    }

    const timeline = createOrderTimeline(order);
    const totalItems = (order.items || []).reduce((sum, item) => sum + (item.qty || 0), 0);

    const responseData = {
      success: true,
      data: {
        order: {
          ...order,
          items: processedItems,
          totalItems: totalItems,
          statusText: getStatusText(order.status),
          formattedTotal: `${order.totalPrice || 0} د.ع`,
          createdAtFormatted: order.createdAt ? new Date(order.createdAt).toLocaleString('ar-SA') : null,
          deliveredAtFormatted: order.deliveredAt ? new Date(order.deliveredAt).toLocaleString('ar-SA') : null
        },
        tracking: {
          currentLocation: driverLocation,
          locationHistory: locationHistory,
          lastUpdated: driverLocation?.updatedAt || null,
          estimatedDelivery: calculateETA(order),
          hasLocation: !!driverLocation
        },
        timeline: timeline,
        permissions: {
          canCancel: ['pending', 'accepted'].includes(order.status) && (isVendor || isAdmin),
          canUpdateStatus: (isDriver && ['accepted', 'ready', 'picked'].includes(order.status)) || isAdmin,
          canContactDriver: !!order.driver && ['accepted', 'ready', 'picked'].includes(order.status),
          canReassign: isAdmin,
          canRate: order.status === 'delivered' && isVendor
        },
        store: order.store ? {
          id: order.store._id,
          name: order.store.name,
          phone: order.store.phone,
          address: order.store.addressLine,
          image: order.store.image
        } : null,
        driver: order.driver ? {
          id: order.driver._id,
          name: order.driver.name,
          phone: order.driver.phone,
          image: order.driver.image,
          rating: order.driver.rating
        } : null
      },
      userId,
      timestamp: new Date().toISOString()
    };

    cache.set(cacheKey, responseData, 30);
    res.json(responseData);
  } catch (error) {
    console.error('❌ Get order details error:', error);
    console.error('Stack:', error.stack);

    res.status(500).json({
      success: false,
      message: 'فشل جلب بيانات الطلب',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    الحصول على طلبات المستخدم الحالي
 * @route   GET /api/v1/client/orders/me
 * @access  Client
 */
exports.getMyOrdersPaginated = async (req, res) => {
  try {
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;
    const userId = req.user.id;

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

    const cacheKey = `orders:user:${userId}:${JSON.stringify(query)}:${skip}:${limit}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`📦 Serving user orders from cache for user ${userId}`);
      return res.json({
        ...cachedData,
        cached: true
      });
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

    const ordersWithDetails = orders.map(order => ({
      ...order,
      statusText: getStatusText(order.status),
      estimatedDelivery: calculateETA(order),
      itemCount: order.items?.reduce((sum, item) => sum + (item.qty || 0), 0) || 0
    }));

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

    cache.set(cacheKey, response, 60);
    res.json(response);
  } catch (error) {
    console.error('❌ Get my orders error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الطلبات'
    });
  }
};

/**
 * @desc    الحصول على طلبات المندوب
 * @route   GET /api/v1/driver/deliveries
 * @access  Driver
 */
exports.getDriverOrders = async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بالوصول إلى هذه البيانات'
      });
    }

    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;
    const driverId = req.user.id;

    let query = { driver: driverId };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.minDate || filters.maxDate) {
      query.createdAt = {};
      if (filters.minDate) query.createdAt.$gte = new Date(filters.minDate);
      if (filters.maxDate) query.createdAt.$lte = new Date(filters.maxDate);
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'name phone image')
        .populate('store', 'name image addressLine phone')
        .populate('pickupAddress', 'label addressLine city latitude longitude')
        .populate('deliveryAddress', 'label addressLine city latitude longitude')
        .select('status totalPrice createdAt items notes')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(query)
    ]);

    const driverStats = await Order.aggregate([
      { $match: { driver: driverId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalEarnings: { $sum: { $multiply: ['$totalPrice', 0.8] } }
        }
      }
    ]);

    const totalDelivered = driverStats
      .filter(stat => stat._id === 'delivered')
      .reduce((sum, stat) => sum + stat.count, 0);

    const totalEarnings = driverStats
      .reduce((sum, stat) => sum + stat.totalEarnings, 0);

    const currentActive = await Order.countDocuments({
      driver: driverId,
      status: { $in: ['accepted', 'ready', 'picked'] }
    });

    const response = PaginationUtils.createPaginationResponse(
      orders,
      total,
      paginationOptions,
      {
        stats: {
          totalDelivered,
          totalEarnings,
          currentActive,
          byStatus: driverStats.reduce((acc, stat) => {
            acc[stat._id] = {
              count: stat.count,
              earnings: stat.totalEarnings
            };
            return acc;
          }, {})
        }
      }
    );

    res.json(response);
  } catch (error) {
    console.error('❌ Get driver orders error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل جلب طلبات المندوب'
    });
  }
};

/**
 * @desc    الحصول على جميع الطلبات (للأدمن)
 * @route   GET /api/v1/admin/orders
 * @access  Admin
 */
exports.getAllOrdersPaginated = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بالوصول إلى هذه البيانات'
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

    if (filters.user) {
      query.user = filters.user;
    }

    if (filters.driver) {
      query.driver = filters.driver;
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
        cached: true
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
      Order.countDocuments(query)
    ]);

    const stats = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$totalPrice' },
          avgOrderValue: { $avg: '$totalPrice' }
        }
      }
    ]);

    const totalRevenue = stats.reduce((sum, stat) => sum + stat.totalRevenue, 0);
    const totalOrders = stats.reduce((sum, stat) => sum + stat.count, 0);
    const todayRevenue = await exports.getTodayRevenue(query);

    const response = PaginationUtils.createPaginationResponse(
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
          avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
          todayRevenue: todayRevenue.totalRevenue,
          todayOrders: todayRevenue.orderCount
        }
      }
    );

    cache.set(cacheKey, response, 30);
    res.json(response);
  } catch (error) {
    console.error('❌ Get all orders error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الطلبات'
    });
  }
};

// ========== 4. دوال أصحاب المتاجر (Store Vendor) ==========

/**
 * @desc    قبول الطلب (لصاحب المتجر)
 * @route   PUT /api/v1/vendor/orders/:id/accept
 * @access  Vendor
 */
exports.acceptOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId).select('storeVendorInfo');
    if (!user?.storeVendorInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeVendorInfo.store;
    const order = await Order.findOne({
      _id: id,
      store: storeId,
      status: "pending"
    }).populate('user', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود أو تم التعامل معه مسبقاً"
      });
    }

    order.status = "accepted";
    order.estimatedPreparationTime = 60;
    await order.save();

    await notificationService.sendNotification({
      user: order.user._id,
      type: "order_accepted",
      title: "✅ تم قبول طلبك",
      content: `تم قبول طلبك، الوقت المتوقع: 60 دقيقة`,
      data: { orderId: order._id },
      priority: "high",
      link: `/orders/${order._id}`,
      icon: "✅"
    });

    await invalidateOrderCache(order._id, order.user._id);

    res.json({
      success: true,
      message: "تم قبول الطلب بنجاح",
      data: {
        orderId: order._id,
        status: order.status,
        estimatedTime: 60
      }
    });
  } catch (error) {
    console.error("❌ Accept order error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل قبول الطلب"
    });
  }
};

/**
 * @desc    رفض الطلب (لصاحب المتجر)
 * @route   PUT /api/v1/vendor/orders/:id/reject
 * @access  Vendor
 */
exports.rejectOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId).select('storeVendorInfo');

    if (!user?.storeVendorInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeVendorInfo.store;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "يرجى تقديم سبب الرفض (5 أحرف على الأقل)"
      });
    }

    const order = await Order.findOne({
      _id: id,
      store: storeId,
      status: "pending"
    }).populate('user', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود أو تم التعامل معه مسبقاً"
      });
    }

    order.status = "cancelled";
    order.rejectionReason = reason.trim();
    order.cancelledBy = userId;
    order.cancelledAt = new Date();
    await order.save();

    await notificationService.sendNotification({
      user: order.user._id,
      type: "order_cancelled",
      title: "❌ تم رفض طلبك",
      content: `تم رفض طلبك: ${reason}`,
      data: { orderId: order._id },
      priority: "high",
      link: `/orders/${order._id}`,
      icon: "❌"
    });

    await invalidateOrderCache(order._id, order.user._id);

    res.json({
      success: true,
      message: "تم رفض الطلب",
      data: {
        orderId: order._id,
        reason: reason
      }
    });
  } catch (error) {
    console.error("❌ Reject order error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل رفض الطلب"
    });
  }
};

/**
 * @desc    طلب جاهز (لصاحب المتجر)
 * @route   PUT /api/v1/vendor/orders/:id/mark-ready
 * @access  Vendor
 */
exports.markOrderReady = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId).select('storeVendorInfo');

    if (!user?.storeVendorInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeVendorInfo.store;

    const order = await Order.findOne({
      _id: id,
      store: storeId,
      status: "accepted"
    }).populate('user', 'name phone').populate('driver', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود أو ليس في حالة قبول"
      });
    }

    order.status = "ready";
    await order.save();

    if (order.driver) {
      await notificationService.sendNotification({
        user: order.driver._id,
        type: "order_ready",
        title: "📦 الطلب جاهز",
        content: `الطلب #${order._id.toString().slice(-6)} جاهز للاستلام`,
        data: { orderId: order._id },
        priority: "high",
        link: `/driver/orders/${order._id}`,
        icon: "📦"
      });
    }

    await notificationService.sendNotification({
      user: order.user._id,
      type: "order_ready",
      title: "🍽️ طلبك جاهز",
      content: `طلبك #${order._id.toString().slice(-6)} جاهز للاستلام من المتجر`,
      data: { orderId: order._id },
      priority: "high",
      link: `/orders/${order._id}`,
      icon: "🍽️"
    });

    await invalidateOrderCache(order._id, order.user._id);

    res.json({
      success: true,
      message: "تم تحديث حالة الطلب إلى جاهز",
      data: {
        orderId: order._id,
        status: order.status
      }
    });
  } catch (error) {
    console.error("❌ Mark order ready error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تحديث حالة الطلب"
    });
  }
};

/**
 * @desc    طلبات المتجر الحالية (لصاحب المتجر)
 * @route   GET /api/v1/vendor/orders
 * @access  Vendor
 */
exports.getVendorOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select('storeVendorInfo');

    if (!user?.storeVendorInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeVendorInfo.store;
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;

    let query = { store: storeId };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.minDate || filters.maxDate) {
      query.createdAt = {};
      if (filters.minDate) query.createdAt.$gte = new Date(filters.minDate);
      if (filters.maxDate) query.createdAt.$lte = new Date(filters.maxDate);
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'name phone')
        .populate('driver', 'name phone')
        .populate('items.item')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(query)
    ]);

    const stats = {
      pending: await Order.countDocuments({ store: storeId, status: 'pending' }),
      accepted: await Order.countDocuments({ store: storeId, status: 'accepted' }),
      ready: await Order.countDocuments({ store: storeId, status: 'ready' }),
      completed: await Order.countDocuments({ store: storeId, status: 'delivered' })
    };

    const response = PaginationUtils.createPaginationResponse(
      orders,
      total,
      paginationOptions,
      { stats }
    );

    res.json(response);
  } catch (error) {
    console.error("❌ Get vendor orders error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب طلبات المتجر"
    });
  }
};

/**
 * @desc    إحصائيات طلبات المتجر
 * @route   GET /api/v1/vendor/orders/stats
 * @access  Vendor
 */
exports.getVendorOrderStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select('storeVendorInfo');

    if (!user?.storeVendorInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeVendorInfo.store;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [todayStats, weekStats, totalStats, byStatus] = await Promise.all([
      Order.aggregate([
        { $match: { store: storeId, createdAt: { $gte: today } } },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: '$totalPrice' }
          }
        }
      ]),
      Order.aggregate([
        { $match: { store: storeId, createdAt: { $gte: weekAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            orders: { $sum: 1 },
            revenue: { $sum: '$totalPrice' }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Order.aggregate([
        { $match: { store: storeId } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$totalPrice' },
            avgOrderValue: { $avg: '$totalPrice' }
          }
        }
      ]),
      Order.aggregate([
        { $match: { store: storeId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        today: todayStats[0] || { orders: 0, revenue: 0 },
        weekly: weekStats,
        total: totalStats[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
        byStatus: byStatus.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error("❌ Get vendor order stats error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب إحصائيات الطلبات"
    });
  }
};

/**
 * @desc    بدء تحضير الطلب (لصاحب المتجر)
 * @route   PUT /api/v1/vendor/orders/:id/start-preparing
 * @access  Vendor
 */
exports.startPreparing = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId).select('storeVendorInfo');

    if (!user?.storeVendorInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeVendorInfo.store;

    const order = await Order.findOne({
      _id: id,
      store: storeId,
      status: "accepted"
    }).populate('user', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود أو ليس في حالة قبول"
      });
    }

    const estimatedTime = req.body.estimatedTime || order.estimatedPreparationTime || 15;
    order.estimatedPreparationTime = estimatedTime;
    await order.save();

    await notificationService.sendNotification({
      user: order.user._id,
      type: "order_preparing",
      title: "👨‍🍳 جاري تحضير طلبك",
      content: `بدأنا تحضير طلبك، الوقت المتوقع: ${estimatedTime} دقيقة`,
      data: { orderId: order._id, estimatedTime },
      priority: "medium",
      link: `/orders/${order._id}`,
      icon: "👨‍🍳"
    });

    res.json({
      success: true,
      message: "تم بدء تحضير الطلب",
      data: {
        orderId: order._id,
        status: order.status,
        estimatedTime
      }
    });
  } catch (error) {
    console.error("❌ Start preparing error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل بدء تحضير الطلب"
    });
  }
};

/**
 * @desc    طلبات اليوم (لصاحب المتجر)
 * @route   GET /api/v1/vendor/orders/today
 * @access  Vendor
 */
exports.getTodayOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select('storeVendorInfo');

    if (!user?.storeVendorInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeVendorInfo.store;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const orders = await Order.find({
      store: storeId,
      createdAt: { $gte: today }
    })
      .populate('user', 'name phone')
      .populate('driver', 'name phone')
      .sort({ createdAt: -1 })
      .lean();

    const stats = {
      total: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      accepted: orders.filter(o => o.status === 'accepted').length,
      ready: orders.filter(o => o.status === 'ready').length,
      picked: orders.filter(o => o.status === 'picked').length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
      revenue: orders
        .filter(o => o.status === 'delivered')
        .reduce((sum, o) => sum + o.totalPrice, 0)
    };

    res.json({
      success: true,
      data: {
        orders,
        stats,
        date: today
      }
    });
  } catch (error) {
    console.error("❌ Get today orders error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب طلبات اليوم"
    });
  }
};

// ========== 5. دوال تحديث الطلبات ==========

/**
 * @desc    تحديث حالة الطلب
 * @route   PUT /api/v1/orders/:id/status
 * @access  Driver / Admin
 */
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const validStatuses = ["pending", "accepted", "ready", "picked", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "حالة الطلب غير صالحة"
      });
    }

    const oldOrder = await Order.findById(id)
      .populate('user', 'id name phone')
      .populate('driver', 'id name')
      .populate('store', 'name');

    if (!oldOrder) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود"
      });
    }

    const isDriver = userRole === 'driver' && oldOrder.driver?._id.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (!isDriver && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بتحديث هذا الطلب"
      });
    }

    if (!isValidStatusTransition(oldOrder.status, status, userRole)) {
      return res.status(400).json({
        success: false,
        message: "تغيير الحالة غير مسموح به"
      });
    }

    const order = await Order.findByIdAndUpdate(
      id,
      {
        status,
        ...(status === 'delivered' ? { deliveredAt: new Date() } : {})
      },
      { returnDocument: 'after' }
    )
      .populate('user', 'name phone')
      .populate('driver', 'name phone')
      .populate('store', 'name')
      .populate('pickupAddress')
      .populate('deliveryAddress');

    if (status === 'delivered' && order.driver) {
      await User.findByIdAndUpdate(order.driver._id, {
        $inc: {
          'driverInfo.totalDeliveries': 1,
          'driverInfo.earnings': order.totalPrice * 0.8
        }
      });
    }

    try {
      await notificationService.updateOrderStatusNotifications(
        order,
        oldOrder.status,
        status
      );
    } catch (notificationError) {
      console.error('❌ Notification error:', notificationError.message);
    }

    await invalidateOrderCache(order._id, order.user._id);

    res.json({
      success: true,
      message: `تم تحديث حالة الطلب إلى ${getStatusText(status)}`,
      data: {
        order,
        statusChange: {
          from: oldOrder.status,
          to: status,
          fromText: getStatusText(oldOrder.status),
          toText: getStatusText(status)
        },
        timeline: createOrderTimeline(order)
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Update status error:', error.message);
    res.status(500).json({
      success: false,
      message: "فشل تحديث حالة الطلب"
    });
  }
};

/**
 * @desc    إلغاء الطلب
 * @route   PUT /api/v1/orders/:id/cancel
 * @access  Client / Admin
 */
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const order = await Order.findOne({ _id: id })
      .populate('user', 'id name phone')
      .populate('driver', 'id name');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود'
      });
    }

    const isVendor = order.user._id.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (!isVendor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بإلغاء هذا الطلب'
      });
    }

    if (!['pending', 'accepted'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن إلغاء الطلب في هذه المرحلة'
      });
    }

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'يرجى تقديم سبب للإلغاء (5 أحرف على الأقل)'
      });
    }

    order.status = 'cancelled';
    order.cancellationReason = reason.trim();
    order.cancelledAt = new Date();
    order.cancelledBy = userId;
    await order.save();

    if (order.driver) {
      await DriverLocation.findOneAndUpdate(
        { driver: order.driver._id, order: id },
        { order: null }
      );
    }

    try {
      await notificationService.updateOrderStatusNotifications(
        order,
        order.status,
        'cancelled'
      );
    } catch (notificationError) {
      console.error('❌ Notification error:', notificationError.message);
    }

    await User.findByIdAndUpdate(userId, {
      $inc: { 'stats.cancelledOrders': 1 }
    });

    await invalidateOrderCache(order._id, userId);

    res.json({
      success: true,
      message: 'تم إلغاء الطلب بنجاح',
      data: {
        orderId: order._id,
        status: order.status,
        cancelledAt: order.cancelledAt,
        reason: reason
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Cancel order error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل إلغاء الطلب'
    });
  }
};

// ========== 6. دوال تعيين المندوبين ==========

/**
 * @desc    تعيين مندوب للطلب
 * @route   PUT /api/v1/admin/orders/:id/assign
 * @access  Admin
 */
exports.assignDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { driverId } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بهذا الإجراء"
      });
    }

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: "معرِّف المندوب مطلوب"
      });
    }

    const oldOrder = await Order.findById(id)
      .populate('user', 'id name')
      .populate('store', 'name');

    if (!oldOrder) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود"
      });
    }

    const driver = await User.findOne({
      _id: driverId,
      role: 'driver',
      isActive: true
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "المندوب غير موجود أو غير نشط"
      });
    }

    if (oldOrder.driver) {
      await DriverLocation.findOneAndUpdate(
        { driver: oldOrder.driver, order: id },
        { order: null }
      );
    }

    const order = await Order.findByIdAndUpdate(
      id,
      {
        driver: driverId,
        status: "accepted"
      },
      { new: true }
    )
      .populate("driver", "name phone image rating")
      .populate("user", "name phone")
      .populate("store", "name")
      .populate("pickupAddress")
      .populate("deliveryAddress");

    await DriverLocation.findOneAndUpdate(
      { driver: driverId },
      {
        driver: driverId,
        order: id,
        location: order.pickupAddress?.location || {
          type: 'Point',
          coordinates: [2.1098, 13.5126]
        }
      },
      { upsert: true, new: true }
    );

    try {
      await notificationService.sendNotification({
        user: order.user._id,
        type: "driver_assigned",
        title: "تم تعيين مندوب",
        content: `تم تعيين مندوب ${order.driver.name} لتوصيل طلبك`,
        data: { orderId: order._id, driver: order.driver },
        priority: "high",
        link: `/orders/${order._id}`,
        icon: "🚗"
      });

      await notificationService.sendNotification({
        user: order.driver._id,
        type: "order_assigned",
        title: "طلب جديد معين لك",
        content: `تم تعيين طلب #${order._id.toString().slice(-6)} لك للتوصيل`,
        data: { orderId: order._id, customer: order.user },
        priority: "high",
        link: `/driver/orders/${order._id}`,
        icon: "🛒"
      });
    } catch (notificationError) {
      console.error('❌ Notification error:', notificationError.message);
    }

    await invalidateOrderCache(order._id, order.user._id);

    res.json({
      success: true,
      message: "تم تعيين المندوب بنجاح",
      data: {
        order,
        driver: {
          id: order.driver._id,
          name: order.driver.name,
          phone: order.driver.phone,
          rating: order.driver.rating
        }
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Assign driver error:', error.message);
    res.status(500).json({
      success: false,
      message: "فشل تعيين المندوب"
    });
  }
};

/**
 * @desc    إعادة تعيين المندوب (تلقائي)
 * @route   PUT /api/v1/admin/orders/:orderId/reassign
 * @access  Admin
 */
exports.reassignDriver = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بهذا الإجراء"
      });
    }

    const order = await Order.findById(orderId)
      .populate("pickupAddress")
      .populate("user", "id");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود"
      });
    }

    if (order.driver) {
      await DriverLocation.findOneAndUpdate(
        { driver: order.driver, order: orderId },
        { order: null }
      );
    }

    order.driver = null;
    order.status = "pending";
    await order.save();

    let newDriver = null;
    if (order.pickupAddress && order.pickupAddress.latitude && order.pickupAddress.longitude) {
      newDriver = await assignClosestDriver(order._id, [
        order.pickupAddress.longitude,
        order.pickupAddress.latitude
      ]);
    }

    await invalidateOrderCache(order._id, order.user._id);

    res.json({
      success: true,
      message: newDriver ? "تم إعادة تعيين المندوب بنجاح" : "لا يوجد مناديب متاحين حالياً",
      data: {
        orderId: order._id,
        newDriver: newDriver ? {
          id: newDriver._id,
          name: newDriver.name,
          phone: newDriver.phone
        } : null,
        status: order.status
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Reassign driver error:', error.message);
    res.status(500).json({
      success: false,
      message: "فشل إعادة تعيين المندوب"
    });
  }
};

// ========== 7. دوال تتبع الموقع والتقييم ==========

/**
 * @desc    تتبع الطلب (مبسط)
 * @route   GET /api/v1/orders/:id/track
 * @access  Authenticated (Vendor, Driver, Admin)
 */
exports.trackOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const order = await Order.findById(id)
      .populate('driver', 'name phone image rating')
      .populate('store', 'name image phone addressLine')
      .populate('pickupAddress')
      .populate('deliveryAddress')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود"
      });
    }

    const isVendor = order.user.toString() === userId;
    const isDriver = order.driver && order.driver._id.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (!isVendor && !isDriver && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بتتبع هذا الطلب"
      });
    }

    let driverLocation = null;
    if (order.driver && ['accepted', 'ready', 'picked'].includes(order.status)) {
      const location = await DriverLocation.findOne({
        driver: order.driver._id,
        order: order._id
      }).lean();

      if (location) {
        driverLocation = {
          latitude: location.location.coordinates[1],
          longitude: location.location.coordinates[0],
          updatedAt: location.createdAt
        };
      }
    }

    const estimatedRemaining = calculateETA(order);

    const trackingPoints = [
      {
        status: 'order_placed',
        title: 'تم تقديم الطلب',
        description: 'تم استلام طلبك بنجاح',
        timestamp: order.createdAt,
        completed: true
      },
      {
        status: 'order_confirmed',
        title: 'تم تأكيد الطلب',
        description: order.status === 'pending' ? 'في انتظار التأكيد' : 'تم تأكيد الطلب من قبل المتجر',
        timestamp: order.status !== 'pending' ? order.updatedAt : null,
        completed: order.status !== 'pending'
      },
      {
        status: 'preparing',
        title: 'جاري التحضير',
        description: order.status === 'accepted' ? 'المتجر يحضر طلبك' : 'لم يبدأ التحضير بعد',
        timestamp: order.status === 'accepted' ? order.updatedAt : null,
        completed: order.status === 'accepted' || order.status === 'ready' || order.status === 'picked' || order.status === 'delivered'
      },
      {
        status: 'ready',
        title: 'الطلب جاهز',
        description: 'الطلب جاهز للاستلام من المتجر',
        timestamp: order.status === 'ready' ? order.updatedAt : null,
        completed: order.status === 'ready' || order.status === 'picked' || order.status === 'delivered'
      },
      {
        status: 'picked_up',
        title: 'تم الاستلام',
        description: order.driver ? 'تم استلام الطلب من المتجر' : 'في انتظار المندوب',
        timestamp: order.status === 'picked' || order.status === 'delivered' ? order.updatedAt : null,
        completed: order.status === 'picked' || order.status === 'delivered'
      },
      {
        status: 'on_the_way',
        title: 'في الطريق إليك',
        description: order.driver ? 'المندوب في طريقه إليك' : 'سيتم تعيين مندوب قريباً',
        timestamp: order.status === 'picked' || order.status === 'delivered' ? order.updatedAt : null,
        completed: order.status === 'picked' || order.status === 'delivered'
      },
      {
        status: 'delivered',
        title: 'تم التوصيل',
        description: 'تم توصيل طلبك بنجاح',
        timestamp: order.status === 'delivered' ? order.updatedAt : null,
        completed: order.status === 'delivered'
      }
    ];

    let driverInfo = null;
    if (order.driver) {
      driverInfo = {
        id: order.driver._id,
        name: order.driver.name,
        phone: order.driver.phone,
        rating: order.driver.rating,
        location: driverLocation
      };
    }

    res.json({
      success: true,
      data: {
        orderId: order._id,
        status: order.status,
        statusText: getStatusText(order.status),
        estimatedDelivery: estimatedRemaining,
        trackingPoints,
        driver: driverInfo,
        store: {
          name: order.store.name,
          address: order.store.addressLine,
          phone: order.store.phone
        },
        pickupAddress: order.pickupAddress,
        deliveryAddress: order.deliveryAddress,
        items: order.items?.map(item => ({
          name: item.name,
          quantity: item.qty,
          price: item.price
        })),
        totalPrice: order.totalPrice,
        canCancel: ['pending', 'accepted'].includes(order.status) && (isVendor || isAdmin),
        canContactDriver: !!order.driver && ['accepted', 'ready', 'picked'].includes(order.status)
      }
    });

  } catch (error) {
    console.error("❌ Track order error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تتبع الطلب"
    });
  }
};

/**
 * @desc    تحديث موقع المندوب
 * @route   POST /api/v1/orders/:id/location
 * @access  Driver
 */
exports.updateDriverLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    if (req.user.role !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بهذا الإجراء'
      });
    }

    const order = await Order.findOne({
      _id: id,
      driver: req.user.id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود أو غير معين لك'
      });
    }

    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        message: 'إحداثيات الموقع غير صالحة'
      });
    }

    const driverLocation = await DriverLocation.findOneAndUpdate(
      { driver: req.user.id, order: id },
      {
        driver: req.user.id,
        order: id,
        location: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        },
        createdAt: new Date()
      },
      { upsert: true, new: true }
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`order:${id}`).emit('driver:location:updated', {
        orderId: id,
        driverId: req.user.id,
        location: { latitude, longitude },
        timestamp: new Date()
      });
    }

    cache.del(`order:full:${id}`);
    cache.del(`order:tracking:${id}:${order.user}`);

    res.json({
      success: true,
      message: 'تم تحديث الموقع بنجاح',
      data: {
        orderId: id,
        location: { latitude, longitude },
        timestamp: driverLocation.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Update driver location error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل تحديث الموقع'
    });
  }
};

/**
 * @desc    الحصول على موقع المندوب
 * @route   GET /api/v1/orders/:id/location
 * @access  Client / Admin
 */
exports.getDriverLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({
      _id: id,
      user: userId
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود أو لا تملك صلاحية الوصول إليه'
      });
    }

    if (!order.driver) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم تعيين مندوب لهذا الطلب بعد'
      });
    }

    const driverLocation = await DriverLocation.findOne({
      driver: order.driver,
      order: id
    });

    if (!driverLocation) {
      return res.status(404).json({
        success: false,
        message: 'موقع المندوب غير متاح حالياً'
      });
    }

    const driverInfo = await User.findById(order.driver).select('name phone image rating');

    res.json({
      success: true,
      data: {
        orderId: id,
        driver: driverInfo,
        location: {
          latitude: driverLocation.location.coordinates[1],
          longitude: driverLocation.location.coordinates[0]
        },
        updatedAt: driverLocation.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Get driver location error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل جلب موقع المندوب'
    });
  }
};

/**
 * @desc    الجدول الزمني للطلب
 * @route   GET /api/v1/orders/:id/timeline
 * @access  Authenticated
 */
exports.getOrderTimeline = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await Order.findById(id)
      .populate('driver', 'name')
      .populate('store', 'name')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود"
      });
    }

    const isVendor = order.user.toString() === userId;
    const isDriver = order.driver && order.driver._id.toString() === userId;
    const isAdmin = req.user.role === 'admin';

    if (!isVendor && !isDriver && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بالوصول"
      });
    }

    const timeline = createOrderTimeline(order);

    res.json({
      success: true,
      data: {
        orderId: order._id,
        status: order.status,
        timeline
      }
    });
  } catch (error) {
    console.error("❌ Get order timeline error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب الجدول الزمني"
    });
  }
};

/**
 * @desc    أرباح المندوب
 * @route   GET /api/v1/driver/earnings
 * @access  Driver
 */
exports.getDriverEarnings = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { period = 'week' } = req.query;

    let startDate = new Date();
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

    const earnings = await Order.aggregate([
      {
        $match: {
          driver: driverId,
          status: 'delivered',
          deliveredAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$deliveredAt' }
          },
          orders: { $sum: 1 },
          totalEarnings: { $sum: { $multiply: ['$totalPrice', 0.8] } },
          averageEarning: { $avg: { $multiply: ['$totalPrice', 0.8] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const totals = await Order.aggregate([
      {
        $match: {
          driver: driverId,
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalEarnings: { $sum: { $multiply: ['$totalPrice', 0.8] } },
          averageEarning: { $avg: { $multiply: ['$totalPrice', 0.8] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period,
        earnings,
        totals: totals[0] || { totalOrders: 0, totalEarnings: 0, averageEarning: 0 },
        currency: 'XOF'
      }
    });
  } catch (error) {
    console.error("❌ Get driver earnings error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب أرباح المندوب"
    });
  }
};

/**
 * @desc    التوصيلة الحالية للمندوب
 * @route   GET /api/v1/driver/current-delivery
 * @access  Driver
 */
exports.getCurrentDelivery = async (req, res) => {
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
      .populate({
        path: 'items.item',
        model: 'Product',
        select: 'name price image description',
        options: { strictPopulate: false }
      })
      .lean();

    if (!currentOrder) {
      return res.json({
        success: true,
        data: null,
        message: "لا يوجد توصيلة حالية"
      });
    }

    // معالجة items
    const processedItems = (currentOrder.items || []).map(item => ({
      ...item,
      productDetails: item.item || null,
      item: undefined
    }));

    let driverLocation = null;
    try {
      const location = await DriverLocation.findOne({
        driver: driverId,
        order: currentOrder._id
      }).lean();

      if (location && location.location && location.location.coordinates) {
        driverLocation = {
          latitude: location.location.coordinates[1],
          longitude: location.location.coordinates[0],
          updatedAt: location.createdAt,
          accuracy: location.accuracy,
          speed: location.speed,
          heading: location.heading
        };
      }
    } catch (locError) {
      console.log('⚠️ Could not fetch driver location:', locError.message);
    }

    const cleanOrder = {
      ...currentOrder,
      items: processedItems,
      __v: undefined
    };

    res.json({
      success: true,
      data: {
        order: cleanOrder,
        driverLocation: driverLocation,
        estimatedDelivery: calculateETA(currentOrder),
        timeline: createOrderTimeline(currentOrder),
        metadata: {
          hasDriverLocation: !!driverLocation,
          itemCount: currentOrder.items?.length || 0,
          statusText: getStatusText(currentOrder.status)
        }
      }
    });
  } catch (error) {
    console.error("❌ Get current delivery error:", error.message);
    console.error("Stack:", error.stack);

    res.status(200).json({
      success: true,
      data: null,
      message: "لا يوجد توصيلة حالية",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ========== 8. دوال الإحصائيات ==========

/**
 * @desc    الحصول على إحصائيات الطلبات
 * @route   GET /api/v1/admin/orders/stats/overview
 * @access  Admin
 */
exports.getOrderStats = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بالوصول إلى هذه البيانات'
      });
    }

    const { startDate, endDate } = req.query;
    const filter = {};

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const cacheKey = `order:stats:${JSON.stringify(filter)}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    const stats = await Order.aggregate([
      { $match: filter },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: '$totalPrice' },
                avgOrderValue: { $avg: '$totalPrice' },
                minOrderValue: { $min: '$totalPrice' },
                maxOrderValue: { $max: '$totalPrice' }
              }
            }
          ],
          byStatus: [
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalAmount: { $sum: '$totalPrice' }
              }
            }
          ],
          byDay: [
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                },
                orders: { $sum: 1 },
                revenue: { $sum: '$totalPrice' }
              }
            },
            { $sort: { _id: -1 } },
            { $limit: 30 }
          ],
          byHour: [
            {
              $group: {
                _id: { $hour: '$createdAt' },
                orders: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ],
          topStores: [
            {
              $group: {
                _id: '$store',
                orders: { $sum: 1 },
                revenue: { $sum: '$totalPrice' }
              }
            },
            { $sort: { orders: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: 'stores',
                localField: '_id',
                foreignField: '_id',
                as: 'storeInfo'
              }
            }
          ]
        }
      }
    ]);

    const response = {
      success: true,
      data: {
        overview: stats[0]?.overview[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          avgOrderValue: 0
        },
        byStatus: stats[0]?.byStatus || [],
        byDay: stats[0]?.byDay || [],
        byHour: stats[0]?.byHour || [],
        topStores: stats[0]?.topStores.map(item => ({
          ...item,
          name: item.storeInfo[0]?.name || 'متجر محذوف'
        })) || []
      },
      filters: { startDate, endDate },
      timestamp: new Date()
    };

    cache.set(cacheKey, response, 300);
    res.json(response);
  } catch (error) {
    console.error('❌ Get order stats error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل جلب إحصائيات الطلبات'
    });
  }
};

/**
 * @desc    الحصول على إحصائيات يومية
 * @route   GET /api/v1/admin/orders/stats/daily
 * @access  Admin
 */
exports.getDailyStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: today }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalPrice' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: stats[0] || {
        totalOrders: 0,
        totalRevenue: 0,
        completedOrders: 0,
        cancelledOrders: 0
      },
      date: today
    });
  } catch (error) {
    console.error('❌ Get daily stats error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الإحصائيات اليومية'
    });
  }
};

/**
 * @desc    الحصول على إحصائيات شهرية
 * @route   GET /api/v1/admin/orders/stats/monthly
 * @access  Admin
 */
exports.getMonthlyStats = async (req, res) => {
  try {
    const { year, month } = req.query;

    let startDate = new Date();
    if (year && month) {
      startDate = new Date(year, month - 1, 1);
    } else {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    }

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalPrice' },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const totals = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalPrice' },
          avgOrderValue: { $avg: '$totalPrice' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: {
          year: startDate.getFullYear(),
          month: startDate.getMonth() + 1,
          monthName: startDate.toLocaleString('ar-SA', { month: 'long' })
        },
        daily: stats,
        totals: totals[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0, completedOrders: 0 }
      }
    });
  } catch (error) {
    console.error('❌ Get monthly stats error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الإحصائيات الشهرية'
    });
  }
};

/**
 * @desc    الحصول على إيرادات اليوم
 */
exports.getTodayRevenue = async (query = {}) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const result = await Order.aggregate([
      {
        $match: {
          ...query,
          createdAt: { $gte: startOfDay, $lte: endOfDay },
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalPrice' },
          orderCount: { $sum: 1 }
        }
      }
    ]);

    return result[0] || { totalRevenue: 0, orderCount: 0 };
  } catch (error) {
    console.error('❌ Get today revenue error:', error.message);
    return { totalRevenue: 0, orderCount: 0 };
  }
};

// ========== 9. دوال الأدمن الإضافية ==========

/**
 * @desc    إلغاء قسري للطلب (لأدمن فقط)
 * @route   PUT /api/v1/admin/orders/:id/force-cancel
 * @access  Admin
 */
exports.forceCancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(id)
      .populate('user', 'name phone')
      .populate('driver', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود"
      });
    }

    const oldStatus = order.status;

    order.status = "cancelled";
    order.cancellationReason = reason || "إلغاء قسري بواسطة الأدمن";
    order.cancelledAt = new Date();
    order.cancelledBy = req.user.id;
    await order.save();

    if (order.user) {
      await notificationService.sendNotification({
        user: order.user._id,
        type: "order_cancelled",
        title: "❌ تم إلغاء طلبك",
        content: `تم إلغاء طلبك #${order._id.toString().slice(-6)}: ${reason || "إلغاء قسري"}`,
        data: { orderId: order._id },
        priority: "urgent",
        link: `/orders/${order._id}`,
        icon: "❌"
      });
    }

    if (order.driver) {
      await notificationService.sendNotification({
        user: order.driver._id,
        type: "order_cancelled",
        title: "❌ تم إلغاء الطلب",
        content: `تم إلغاء الطلب #${order._id.toString().slice(-6)} الذي كنت ستوصله`,
        data: { orderId: order._id },
        priority: "urgent",
        link: `/driver/orders/${order._id}`,
        icon: "❌"
      });
    }

    if (order.driver) {
      await DriverLocation.findOneAndUpdate(
        { driver: order.driver._id, order: id },
        { order: null }
      );
    }

    await invalidateOrderCache(order._id, order.user?._id);

    res.json({
      success: true,
      message: "تم إلغاء الطلب قسرياً بنجاح",
      data: {
        orderId: order._id,
        oldStatus,
        newStatus: "cancelled",
        reason: order.cancellationReason
      }
    });
  } catch (error) {
    console.error("❌ Force cancel order error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل إلغاء الطلب قسرياً"
    });
  }
};

/**
 * @desc    الحصول على طلبات مندوب معين (لأدمن)
 * @route   GET /api/v1/admin/drivers/:driverId/orders
 * @access  Admin
 */
exports.getDriverOrdersById = async (req, res) => {
  try {
    const { driverId } = req.params;
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;

    let query = { driver: driverId };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.minDate || filters.maxDate) {
      query.createdAt = {};
      if (filters.minDate) query.createdAt.$gte = new Date(filters.minDate);
      if (filters.maxDate) query.createdAt.$lte = new Date(filters.maxDate);
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'name phone image')
        .populate('store', 'name image')
        .populate('pickupAddress')
        .populate('deliveryAddress')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(query)
    ]);

    const driverStats = await Order.aggregate([
      { $match: { driver: driverId } },
      {
        $group: {
          _id: null,
          totalDelivered: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] }
          },
          totalEarnings: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, { $multiply: ["$totalPrice", 0.8] }, 0] }
          }
        }
      }
    ]);

    const response = PaginationUtils.createPaginationResponse(
      orders,
      total,
      paginationOptions,
      {
        driverStats: driverStats[0] || { totalDelivered: 0, totalEarnings: 0 }
      }
    );

    res.json(response);
  } catch (error) {
    console.error("❌ Get driver orders by id error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب طلبات المندوب"
    });
  }
};

/**
 * @desc    الحصول على طلبات متجر معين (لأدمن)
 * @route   GET /api/v1/admin/stores/:storeId/orders
 * @access  Admin
 */
exports.getStoreOrdersById = async (req, res) => {
  try {
    const { storeId } = req.params;
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;

    let query = { store: storeId };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.minDate || filters.maxDate) {
      query.createdAt = {};
      if (filters.minDate) query.createdAt.$gte = new Date(filters.minDate);
      if (filters.maxDate) query.createdAt.$lte = new Date(filters.maxDate);
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'name phone')
        .populate('driver', 'name phone')
        .populate('items.item')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(query)
    ]);

    const storeStats = await Order.aggregate([
      { $match: { store: storeId } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$totalPrice" },
          completedOrders: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] }
          }
        }
      }
    ]);

    const response = PaginationUtils.createPaginationResponse(
      orders,
      total,
      paginationOptions,
      {
        storeStats: storeStats[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          completedOrders: 0,
          cancelledOrders: 0
        }
      }
    );

    res.json(response);
  } catch (error) {
    console.error("❌ Get store orders by id error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب طلبات المتجر"
    });
  }
};

// ========== 10. دوال التقييم والإبلاغ ==========

/**
 * @desc    تقييم الطلب
 * @route   POST /api/v1/client/orders/:id/rate
 * @access  Client
 */
exports.rateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment, rateDriver, rateStore } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "التقييم يجب أن يكون بين 1 و 5"
      });
    }

    const order = await Order.findOne({
      _id: id,
      user: req.user.id,
      status: "delivered"
    }).populate('driver').populate('store');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود أو لم يتم توصيله بعد"
      });
    }

    const existingReview = await Review.findOne({
      user: req.user.id,
      order: id
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "لقد قيمت هذا الطلب مسبقاً"
      });
    }

    const review = await Review.create({
      user: req.user.id,
      store: order.store._id,
      order: id,
      rating,
      comment: comment?.trim()
    });

    if (order.store) {
      const storeStats = await Review.aggregate([
        { $match: { store: order.store._id } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$rating" },
            count: { $sum: 1 }
          }
        }
      ]);

      await Store.findByIdAndUpdate(order.store._id, {
        averageRating: storeStats[0]?.avgRating || rating,
        ratingsCount: storeStats[0]?.count || 1
      });
    }

    if (rateDriver && order.driver) {
      const driverRating = typeof rateDriver === 'number' ? rateDriver : rating;

      await User.findByIdAndUpdate(order.driver._id, {
        $inc: { 'driverInfo.totalRatings': 1 },
        $set: { 'driverInfo.rating': driverRating }
      });
    }

    await notificationService.sendNotification({
      user: order.store.vendor || order.store.createdBy,
      type: "new_review",
      title: "⭐ تقييم جديد",
      content: `حصلت على تقييم ${rating} نجوم على طلب #${order._id.toString().slice(-6)}`,
      data: { orderId: order._id, rating, comment },
      priority: "medium",
      link: `/store/reviews`,
      icon: "⭐"
    });

    await invalidateOrderCache(order._id, req.user.id);
    cache.del(`store:complete:${order.store._id}`);

    res.json({
      success: true,
      message: "تم تقييم الطلب بنجاح",
      data: {
        review,
        rating,
        comment
      }
    });
  } catch (error) {
    console.error("❌ Rate order error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تقييم الطلب"
    });
  }
};

/**
 * @desc    الإبلاغ عن مشكلة في الطلب
 * @route   POST /api/v1/client/orders/:id/report-issue
 * @access  Client
 */
exports.reportOrderIssue = async (req, res) => {
  try {
    const { id } = req.params;
    const { issue, description } = req.body;

    if (!issue || !description) {
      return res.status(400).json({
        success: false,
        message: "نوع المشكلة ووصفها مطلوبان"
      });
    }

    const order = await Order.findOne({
      _id: id,
      user: req.user.id
    }).populate('store');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود"
      });
    }

    const supportTicket = {
      orderId: order._id,
      userId: req.user.id,
      issueType: issue,
      description,
      status: "open",
      createdAt: new Date()
    };

    const admins = await User.find({ role: 'admin' }).select('_id');

    for (const admin of admins) {
      await notificationService.sendNotification({
        user: admin._id,
        type: "support_ticket",
        title: "⚠️ بلاغ مشكلة جديد",
        content: `مشكلة ${issue} في الطلب #${order._id.toString().slice(-6)}: ${description.substring(0, 50)}...`,
        data: {
          orderId: order._id,
          userId: req.user.id,
          issue,
          description
        },
        priority: "high",
        link: `/admin/support/orders/${order._id}`,
        icon: "⚠️"
      });
    }

    order.notes = order.notes
      ? `${order.notes}\n[مشكلة] ${issue}: ${description}`
      : `[مشكلة] ${issue}: ${description}`;
    await order.save();

    res.json({
      success: true,
      message: "تم الإبلاغ عن المشكلة بنجاح، سيتم التواصل معك قريباً",
      data: {
        ticketId: `TICKET-${Date.now()}`,
        issue,
        description,
        status: "open"
      }
    });
  } catch (error) {
    console.error("❌ Report order issue error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل الإبلاغ عن المشكلة"
    });
  }
};

// ========== 11. دوال جديدة للمندوبين (الإصدار 4.0) ==========

/**
 * @desc    بدء التوصيل (تغيير الحالة من accepted إلى picked)
 * @route   POST /api/v1/driver/orders/:id/start
 * @access  Driver
 */
exports.startDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user.id;

    const order = await Order.findOne({
      _id: id,
      driver: driverId,
      status: 'accepted'
    }).populate('user', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود أو ليس في حالة قبول'
      });
    }

    order.status = 'picked';
    order.pickedAt = new Date();
    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`order:${order._id}`).emit('order:status:updated', {
        orderId: order._id,
        status: 'picked',
        timestamp: new Date()
      });
    }

    await notificationService.sendNotification({
      user: order.user._id,
      type: 'order_picked',
      title: '🚚 بدء التوصيل',
      content: `مندوبك ${req.user.name} في طريقه إليك الآن`,
      data: { orderId: order._id },
      priority: 'high',
      link: `/orders/${order._id}`,
      icon: '🚚'
    });

    await invalidateOrderCache(order._id, order.user._id);

    res.json({
      success: true,
      message: 'تم بدء التوصيل بنجاح',
      data: {
        orderId: order._id,
        status: order.status,
        startedAt: new Date()
      }
    });
  } catch (error) {
    console.error('❌ Start delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل بدء التوصيل'
    });
  }
};

/**
 * @desc    إنهاء الطلب (تغيير الحالة من picked إلى delivered)
 * @route   POST /api/v1/driver/orders/:id/complete
 * @access  Driver
 */
exports.completeOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user.id;
    const { signature, deliveryPhoto } = req.body;

    const order = await Order.findOne({
      _id: id,
      driver: driverId,
      status: 'picked'
    }).populate('user', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود أو ليس في حالة توصيل'
      });
    }

    order.status = 'delivered';
    order.deliveredAt = new Date();

    if (order.createdAt) {
      order.deliveryTime = Math.round((order.deliveredAt - order.createdAt) / 60000);
    }

    if (signature) order.signature = signature;
    if (deliveryPhoto) order.deliveryPhoto = deliveryPhoto;

    await order.save();

    await User.findByIdAndUpdate(driverId, {
      $inc: {
        'driverInfo.totalDeliveries': 1,
        'driverInfo.earnings': order.totalPrice * 0.8
      }
    });

    await notificationService.sendNotification({
      user: order.user._id,
      type: 'order_delivered',
      title: '✅ تم توصيل طلبك',
      content: `تم توصيل طلبك بنجاح. شكراً لك!`,
      data: { orderId: order._id },
      priority: 'high',
      link: `/orders/${order._id}`,
      icon: '✅'
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`order:${order._id}`).emit('order:status:updated', {
        orderId: order._id,
        status: 'delivered',
        timestamp: new Date()
      });
    }

    await invalidateOrderCache(order._id, order.user._id);

    res.json({
      success: true,
      message: 'تم إنهاء الطلب بنجاح',
      data: {
        orderId: order._id,
        status: order.status,
        deliveredAt: order.deliveredAt,
        deliveryTime: order.deliveryTime
      }
    });
  } catch (error) {
    console.error('❌ Complete order error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل إنهاء الطلب'
    });
  }
};

/**
 * @desc    الحصول على تاريخ طلبات المندوب (المكتملة)
 * @route   GET /api/v1/driver/orders/history
 * @access  Driver
 */
exports.getDriverOrdersHistory = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { page = 1, limit = 20, from, to } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let dateQuery = {};
    if (from || to) {
      dateQuery.deliveredAt = {};
      if (from) dateQuery.deliveredAt.$gte = new Date(from);
      if (to) dateQuery.deliveredAt.$lte = new Date(to);
    }

    const [orders, total] = await Promise.all([
      Order.find({
        driver: driverId,
        status: 'delivered',
        ...dateQuery
      })
        .populate('store', 'name image')
        .populate('deliveryAddress')
        .sort({ deliveredAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments({
        driver: driverId,
        status: 'delivered',
        ...dateQuery
      })
    ]);

    const stats = await Order.aggregate([
      {
        $match: {
          driver: driverId,
          status: 'delivered',
          ...dateQuery
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalEarnings: { $sum: { $multiply: ['$totalPrice', 0.8] } },
          averageOrderValue: { $avg: '$totalPrice' },
          totalDistance: { $sum: '$estimatedDistance' }
        }
      }
    ]);

    const monthlyStats = await Order.aggregate([
      {
        $match: {
          driver: driverId,
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$deliveredAt' },
            month: { $month: '$deliveredAt' }
          },
          orders: { $sum: 1 },
          earnings: { $sum: { $multiply: ['$totalPrice', 0.8] } }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    res.json({
      success: true,
      data: {
        orders: orders.map(order => ({
          ...order,
          earning: order.totalPrice * 0.8
        })),
        stats: stats[0] || {
          totalOrders: 0,
          totalEarnings: 0,
          averageOrderValue: 0,
          totalDistance: 0
        },
        monthlyStats: monthlyStats.map(stat => ({
          year: stat._id.year,
          month: stat._id.month,
          monthName: new Date(stat._id.year, stat._id.month - 1, 1).toLocaleString('ar-SA', { month: 'long' }),
          orders: stat.orders,
          earnings: stat.earnings
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('❌ Get driver orders history error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب تاريخ الطلبات'
    });
  }
};

/**
 * @desc    الحصول على موقع الطلب (الاستلام والتوصيل)
 * @route   GET /api/v1/driver/location/order/:orderId
 * @access  Driver
 */
exports.getOrderLocation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const driverId = req.user.id;

    const order = await Order.findOne({
      _id: orderId,
      driver: driverId
    })
      .populate('pickupAddress')
      .populate('deliveryAddress')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود'
      });
    }

    res.json({
      success: true,
      data: {
        pickup: {
          latitude: order.pickupAddress?.latitude,
          longitude: order.pickupAddress?.longitude,
          address: order.pickupAddress?.addressLine,
          city: order.pickupAddress?.city
        },
        delivery: {
          latitude: order.deliveryAddress?.latitude,
          longitude: order.deliveryAddress?.longitude,
          address: order.deliveryAddress?.addressLine,
          city: order.deliveryAddress?.city
        },
        store: {
          name: order.store?.name,
          address: order.store?.addressLine
        }
      }
    });
  } catch (error) {
    console.error('❌ Get order location error:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب موقع الطلب'
    });
  }
};

/**
 * @desc    قبول الطلب بواسطة المندوب
 * @route   PUT /api/v1/driver/orders/:id/accept
 * @access  Driver
 */
exports.acceptOrderByDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user.id;

    console.log(`🚚 Driver ${driverId} attempting to accept order ${id}`);

    const order = await Order.findOne({
      _id: id,
      status: "pending",
      $or: [
        { driver: { $exists: false } },
        { driver: null }
      ]
    }).populate('user', 'name phone')
      .populate('store', 'name address deliveryInfo');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود أو تم قبوله مسبقاً"
      });
    }

    order.driver = driverId;
    order.status = "accepted";
    order.estimatedPreparationTime = 60;
    order.acceptedAt = new Date();

    await order.save();

    await User.findByIdAndUpdate(driverId, {
      'driverInfo.isAvailable': false,
      'driverInfo.currentOrder': order._id
    });

    await notificationService.sendNotification({
      user: order.user._id,
      type: "order_accepted",
      title: "✅ تم قبول طلبك",
      content: `تم تعيين مندوب لتوصيل طلبك، الوقت المتوقع: 60 دقيقة`,
      data: {
        orderId: order._id,
        driverId: driverId,
        estimatedTime: 60
      },
      priority: "high",
      link: `/orders/${order._id}`,
      icon: "✅"
    });

    await notificationService.sendNotification({
      user: driverId,
      type: "order_assigned",
      title: "🛵 طلب جديد",
      content: `تم تعيينك لتوصيل طلب #${order._id.toString().slice(-6)}`,
      data: { orderId: order._id },
      priority: "high",
      link: `/driver/orders/${order._id}`,
      icon: "🛵"
    });

    await invalidateOrderCache(order._id, order.user._id);

    const io = req.app.get('io');
    if (io) {
      io.to(`order:${order._id}`).emit('order:status:updated', {
        orderId: order._id,
        status: 'accepted',
        driverId: driverId,
        estimatedTime: 60,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: "تم قبول الطلب بنجاح",
      data: {
        orderId: order._id,
        status: order.status,
        estimatedTime: 60,
        store: {
          name: order.store.name,
          address: order.store.address,
          pickupLocation: order.pickupAddress
        },
        deliveryLocation: order.deliveryAddress
      }
    });

  } catch (error) {
    console.error("❌ Driver accept order error:", error);
    res.status(500).json({
      success: false,
      message: "فشل قبول الطلب",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = exports;