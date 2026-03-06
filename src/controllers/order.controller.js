const Order = require("../models/order.model");
const Address = require("../models/address.model");
const DriverLocation = require("../models/driverLocation.model");
const cache = require('../utils/cache.util');
const PaginationUtils = require('../utils/pagination.util');
const notificationService = require("../services/notification.service");
const User = require("../models/user.model");

/**
 * 🏎️ دالة مساعدة: تعيين أقرب سائق متاح
 */
const assignClosestDriver = async (orderId, pickupCoordinates) => {
  try {
    // البحث عن سائق متاح بالقرب من موقع الاستلام
    const nearestDriver = await DriverLocation.findOne({ 
      order: null 
    }).where('location').near({
      center: {
        type: 'Point',
        coordinates: pickupCoordinates
      },
      maxDistance: 5000, // 5 كم
      spherical: true
    }).populate('driver', 'name phone image');

    if (!nearestDriver) {
      console.log('🚫 No available drivers found near pickup location');
      return null;
    }

    // تحديث الطلب بالسائق المعين
    await Order.findByIdAndUpdate(orderId, {
      driver: nearestDriver.driver._id,
      status: "accepted",
    });

    // تحديث موقع السائق ليشير إلى هذا الطلب
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
 * 🧹 دالة مساعدة: إبطال الكاش عند تحديث الطلب
 */
const invalidateOrderCache = async (orderId, userId) => {
  try {
    // إبطال كاش لوحة التحكم للمستخدم
    cache.del(`dashboard:${userId}`);

    // إبطال كاش تتبع الطلب
    cache.del(`order:tracking:${orderId}:${userId}`);

    // إبطال كاش لوحة تحكم الأدمن
    cache.invalidatePattern('admin:dashboard:*');
    cache.invalidatePattern('orders:admin:*');

    // إبطال كاش الطلبات العامة
    cache.invalidatePattern('orders:*');
    cache.invalidatePattern('user:complete:*');

    console.log(`🗑️ Invalidated cache for order ${orderId}`);
  } catch (error) {
    console.error('❌ Cache invalidation error:', error);
  }
};

/**
 * 📝 إنشاء طلب جديد
 * POST /api/orders
 */
exports.createOrder = async (req, res) => {
  try {
    const { items, totalPrice, pickupAddress, deliveryAddress, restaurant } = req.body;
    const userId = req.user.id;

    // التحقق من البيانات
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "يجب إضافة عناصر للطلب" 
      });
    }

    if (!totalPrice || totalPrice <= 0) {
      return res.status(400).json({ 
        success: false,
        message: "السعر الإجمالي غير صالح" 
      });
    }

    if (!pickupAddress || !deliveryAddress) {
      return res.status(400).json({ 
        success: false,
        message: "عنوان الاستلام والتوصيل مطلوبان" 
      });
    }

    if (!restaurant) {
      return res.status(400).json({ 
        success: false,
        message: "المطعم مطلوب" 
      });
    }

    // التحقق من ملكية العميل للعناوين
    const pickup = await Address.findOne({ 
      _id: pickupAddress, 
      user: userId 
    });

    const delivery = await Address.findOne({ 
      _id: deliveryAddress, 
      user: userId 
    });

    if (!pickup || !delivery) {
      return res.status(400).json({ 
        success: false,
        message: "العناوين غير صالحة أو لا تملك صلاحية الوصول إليها" 
      });
    }

    // إنشاء الطلب
    const order = await Order.create({
      user: userId,
      items,
      totalPrice,
      pickupAddress,
      deliveryAddress,
      restaurant,
      status: "pending",
    });

    // محاولة تعيين أقرب سائق تلقائيًا
    let assignedDriver = null;
    if (pickup.latitude && pickup.longitude) {
      assignedDriver = await assignClosestDriver(
        order._id, 
        [pickup.longitude, pickup.latitude]
      );
    }

    // إرسال إشعارات الطلب
    try {
      await notificationService.createOrderNotifications(order);
    } catch (notificationError) {
      console.error('❌ Notification error:', notificationError.message);
      // لا نوقف العملية إذا فشلت الإشعارات
    }

    // جلب الطلب مع البيانات المرتبطة
    const populatedOrder = await Order.findById(order._id)
      .populate("user", "name phone image")
      .populate("driver", "name phone image")
      .populate("restaurant", "name image phone")
      .populate("pickupAddress")
      .populate("deliveryAddress")
      .lean();

    // إبطال الكاش
    await invalidateOrderCache(order._id, userId);

    res.status(201).json({
      success: true,
      message: "تم إنشاء الطلب بنجاح",
      data: {
        order: populatedOrder,
        assignedDriver: assignedDriver ? {
          id: assignedDriver._id,
          name: assignedDriver.name,
          phone: assignedDriver.phone
        } : null,
        nextSteps: assignedDriver ? "جاري تجهيز الطلب" : "بانتظار تعيين مندوب"
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Create order error:', error.message);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "بيانات الطلب غير صالحة",
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "حدث خطأ في إنشاء الطلب"
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: "فشل إنشاء الطلب",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 🔄 إعادة تعيين المندوب (للأدمن)
 * PUT /api/orders/:orderId/reassign
 */
exports.reassignDriver = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    // التحقق من صلاحية الأدمن
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

    // إعادة تعيين السائق
    order.driver = null;
    order.status = "pending";
    await order.save();

    // إبطال كاش المندوب القديم
    if (order.driver) {
      await DriverLocation.findOneAndUpdate(
        { driver: order.driver._id, order: orderId },
        { order: null }
      );
    }

    // محاولة تعيين سائق جديد
    let newDriver = null;
    if (order.pickupAddress && order.pickupAddress.latitude && order.pickupAddress.longitude) {
      newDriver = await assignClosestDriver(order._id, [
        order.pickupAddress.longitude,
        order.pickupAddress.latitude,
      ]);
    }

    // إبطال الكاش
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
      message: "فشل إعادة تعيين المندوب",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// controllers/order.controller.js - دالة جديدة
exports.getDashboardStats = async (req, res) => {
  const stats = await Order.aggregate([
    {
      $facet: {
        totalStats: [{
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$totalPrice' },
            avgOrderValue: { $avg: '$totalPrice' }
          }
        }],
        byStatus: [{
          $group: { _id: '$status', count: { $sum: 1 } }
        }],
        last7Days: [{
          $match: { createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) } }
        }, {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            orders: { $sum: 1 }
          }
        }]
      }
    }
  ]);
  
  res.json(stats[0]);
};

/**
 * 📋 الحصول على طلباتي مع Pagination
 * GET /api/orders/me
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
    
    if (filters.restaurant) {
      query.restaurant = filters.restaurant;
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
        cached: true,
      });
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('driver', 'name phone image')
        .populate('restaurant', 'name image')
        .populate('pickupAddress', 'label addressLine city')
        .populate('deliveryAddress', 'label addressLine city')
        .select('status totalPrice createdAt items')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      
      Order.countDocuments(query),
    ]);

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

    const response = PaginationUtils.createPaginationResponse(
      orders,
      total,
      paginationOptions,
      {
        stats,
        summary: {
          totalOrders: total,
          totalSpent: orderStats.reduce((sum, stat) => sum + stat.totalAmount, 0),
          averageOrderValue: total > 0 ? orderStats.reduce((sum, stat) => sum + stat.totalAmount, 0) / total : 0
        }
      }
    );
    
    cache.set(cacheKey, response, 60);
    
    res.json(response);
  } catch (error) {
    console.error('❌ Get my orders paginated error:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'فشل جلب الطلبات',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 📋 الحصول على جميع الطلبات مع Pagination (للأدمن)
 * GET /api/orders
 */
exports.getAllOrdersPaginated = async (req, res) => {
  try {
    // التحقق من صلاحية الأدمن
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
    
    if (filters.restaurant) {
      query.restaurant = filters.restaurant;
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
        }
      }
    ]);

    const totalRevenue = stats.reduce((sum, stat) => sum + stat.totalRevenue, 0);
    const totalOrders = stats.reduce((sum, stat) => sum + stat.count, 0);

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
          revenueToday: await this.getTodayRevenue(query)
        }
      }
    );

    cache.set(cacheKey, response, 30);
    
    res.json(response);
  } catch (error) {
    console.error('❌ Get all orders paginated error:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'فشل جلب الطلبات',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 🔧 تعيين مندوب يدوياً (للأدمن)
 * PUT /api/orders/:id/assign
 */
exports.assignDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { driverId } = req.body;
    const userId = req.user.id;

    // التحقق من صلاحية الأدمن
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

    // التحقق من وجود الطلب
    const oldOrder = await Order.findById(id)
      .populate('user', 'id name')
      .populate('restaurant', 'name');
    
    if (!oldOrder) {
      return res.status(404).json({ 
        success: false,
        message: "الطلب غير موجود" 
      });
    }

    // التحقق من وجود المندوب
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

    // تحديث الطلب
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
      .populate("restaurant", "name")
      .populate("pickupAddress")
      .populate("deliveryAddress");

    // تحديث موقع السائق
    await DriverLocation.findOneAndUpdate(
      { driver: driverId },
      { order: id },
      { upsert: true, new: true }
    );

    // إرسال إشعارات تعيين المندوب
    try {
      // إشعار للعميل
      await notificationService.sendNotification({
        user: order.user._id,
        type: "driver_assigned",
        title: "تم تعيين مندوب",
        content: `تم تعيين مندوب ${order.driver.name} لتوصيل طلبك #${order._id.toString().slice(-6)}.`,
        data: {
          orderId: order._id,
          orderNumber: order._id.toString().slice(-6),
          driver: {
            id: order.driver._id,
            name: order.driver.name,
            phone: order.driver.phone,
            rating: order.driver.rating
          },
          restaurant: order.restaurant.name
        },
        priority: "high",
        link: `/orders/${order._id}`,
        icon: "🚗",
        tags: ["order", "driver_assigned", `order_${order._id}`],
      });

      // إشعار للمندوب
      await notificationService.sendNotification({
        user: order.driver._id,
        type: "order_assigned",
        title: "طلب جديد معين لك",
        content: `تم تعيين طلب #${order._id.toString().slice(-6)} من ${order.restaurant.name} لك للتوصيل.`,
        data: {
          orderId: order._id,
          orderNumber: order._id.toString().slice(-6),
          customer: {
            id: order.user._id,
            name: order.user.name,
            phone: order.user.phone
          },
          restaurant: {
            id: order.restaurant._id,
            name: order.restaurant.name
          },
          pickupAddress: order.pickupAddress,
          deliveryAddress: order.deliveryAddress,
          totalPrice: order.totalPrice
        },
        priority: "high",
        link: `/driver/orders/${order._id}`,
        icon: "🛒",
        tags: ["order", "driver", `order_${order._id}`],
      });
    } catch (notificationError) {
      console.error('❌ Notification error:', notificationError.message);
    }

    // إبطال الكاش
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
      message: "فشل تعيين المندوب",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 🚚 تحديث حالة الطلب (للمندوب)
 * PUT /api/orders/:id/status
 */
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.id;

    // التحقق من الصلاحية (مندوب أو أدمن)
    if (req.user.role !== 'driver' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: "غير مصرح لك بهذا الإجراء" 
      });
    }

    // التحقق من الحالة
    const validStatuses = ["pending", "accepted", "picked", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: "حالة الطلب غير صالحة" 
      });
    }

    // جلب الطلب القديم
    const oldOrder = await Order.findById(id)
      .populate('user', 'id name phone')
      .populate('driver', 'id name')
      .populate('restaurant', 'name');
    
    if (!oldOrder) {
      return res.status(404).json({ 
        success: false,
        message: "الطلب غير موجود" 
      });
    }

    // إذا كان مندوباً، التحقق من أنه المندوب المعين
    if (req.user.role === 'driver' && oldOrder.driver?._id.toString() !== userId) {
      return res.status(403).json({ 
        success: false,
        message: "هذا الطلب غير معين لك" 
      });
    }

    // التحقق من تسلسل الحالات
    if (!this.isValidStatusTransition(oldOrder.status, status, req.user.role)) {
      return res.status(400).json({ 
        success: false,
        message: "تغيير الحالة غير مسموح به" 
      });
    }

    // تحديث حالة الطلب
    const order = await Order.findByIdAndUpdate(
      id, 
      { status }, 
      { new: true }
    )
      .populate('user', 'name phone')
      .populate('driver', 'name phone')
      .populate('restaurant', 'name')
      .populate('pickupAddress')
      .populate('deliveryAddress');

    // إذا كانت الحالة delivered، تحديث إحصائيات السائق
    if (status === 'delivered' && order.driver) {
      await User.findByIdAndUpdate(order.driver._id, {
        $inc: { 
          'driverInfo.totalDeliveries': 1,
          'driverInfo.earnings': order.totalPrice * 0.8 // مثال: 80% للسائق
        }
      });
    }

    // إرسال إشعارات تحديث الحالة
    try {
      await notificationService.updateOrderStatusNotifications(
        order, 
        oldOrder.status, 
        status
      );
    } catch (notificationError) {
      console.error('❌ Notification error:', notificationError.message);
    }

    // إبطال الكاش
    await invalidateOrderCache(order._id, order.user._id);

    res.json({
      success: true,
      message: `تم تحديث حالة الطلب إلى ${this.getStatusText(status)}`,
      data: {
        order,
        statusChange: {
          from: oldOrder.status,
          to: status,
          text: this.getStatusText(status)
        }
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Update status error:', error.message);
    res.status(500).json({ 
      success: false,
      message: "فشل تحديث حالة الطلب",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 📊 الحصول على طلبات المندوب
 * GET /api/orders/driver/me
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
        .populate('restaurant', 'name image addressLine')
        .populate('pickupAddress', 'label addressLine city latitude longitude')
        .populate('deliveryAddress', 'label addressLine city latitude longitude')
        .select('status totalPrice createdAt items')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      
      Order.countDocuments(query),
    ]);

    // إحصائيات المندوب
    const driverStats = await Order.aggregate([
      { $match: { driver: req.user.id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalEarnings: { 
            $sum: { $multiply: ['$totalPrice', 0.8] } // 80% للسائق
          }
        }
      }
    ]);

    const totalDelivered = driverStats
      .filter(stat => stat._id === 'delivered')
      .reduce((sum, stat) => sum + stat.count, 0);

    const totalEarnings = driverStats
      .reduce((sum, stat) => sum + stat.totalEarnings, 0);

    const response = PaginationUtils.createPaginationResponse(
      orders,
      total,
      paginationOptions,
      {
        stats: {
          totalDelivered,
          totalEarnings,
          currentActive: await Order.countDocuments({ 
            driver: driverId, 
            status: { $in: ['accepted', 'picked'] } 
          }),
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
      message: 'فشل جلب طلبات المندوب',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 📈 الحصول على إيرادات اليوم
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

/**
 * 🔄 التحقق من صحة تغيير الحالة
 */
exports.isValidStatusTransition = (oldStatus, newStatus, userRole) => {
  const validTransitions = {
    admin: {
      pending: ['accepted', 'cancelled'],
      accepted: ['picked', 'cancelled'],
      picked: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: []
    },
    driver: {
      pending: [],
      accepted: ['picked'],
      picked: ['delivered'],
      delivered: [],
      cancelled: []
    },
    client: {
      pending: ['cancelled'],
      accepted: ['cancelled'],
      picked: [],
      delivered: [],
      cancelled: []
    }
  };

  const roleTransitions = validTransitions[userRole] || validTransitions.client;
  return roleTransitions[oldStatus]?.includes(newStatus) || false;
};

/**
 * 📝 الحصول على نص الحالة
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

/**
 * 📊 الحصول على إحصائيات الطلبات للمستخدم
 */
exports.getUserOrderStats = async (userId) => {
  try {
    const stats = await Order.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalPrice' }
        }
      }
    ]);

    return stats.reduce((acc, stat) => {
      acc[stat._id] = {
        count: stat.count,
        amount: stat.totalAmount
      };
      return acc;
    }, {});
  } catch (error) {
    console.error('❌ Get user order stats error:', error.message);
    return {};
  }
};

/**
 * 📍 تحديث موقع المندوب
 * POST /api/orders/:id/location
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

    // التحقق من أن الطلب معين لهذا المندوب
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

    // التحقق من الإحداثيات
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'إحداثيات الموقع مطلوبة'
      });
    }

    // تحديث أو إنشاء موقع السائق
    await DriverLocation.findOneAndUpdate(
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

    // إرسال تحديث عبر Socket.io
    const io = req.app.get('io');
    if (io) {
      io.to(`order:${id}`).emit('driver:location:updated', {
        orderId: id,
        driverId: req.user.id,
        location: { latitude, longitude },
        timestamp: new Date()
      });
    }

    // إبطال الكاش
    await invalidateOrderCache(id, order.user);

    res.json({
      success: true,
      message: 'تم تحديث الموقع بنجاح',
      data: {
        orderId: id,
        location: { latitude, longitude },
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('❌ Update driver location error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل تحديث الموقع',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * ❌ إلغاء الطلب
 * PUT /api/orders/:id/cancel
 */
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    // جلب الطلب
    const order = await Order.findOne({ 
      _id: id, 
      user: userId 
    }).populate('user', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود أو لا تملك صلاحية إلغائه'
      });
    }

    // التحقق من إمكانية الإلغاء
    if (!['pending', 'accepted'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن إلغاء الطلب في هذه المرحلة'
      });
    }

    // التحقق من سبب الإلغاء
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'يرجى تقديم سبب للإلغاء (5 أحرف على الأقل)'
      });
    }

    // تحديث حالة الطلب
    order.status = 'cancelled';
    order.cancellationReason = reason.trim();
    order.cancelledAt = new Date();
    order.cancelledBy = userId;
    await order.save();

    // إذا كان هناك سائق معين، تحريره
    if (order.driver) {
      await DriverLocation.findOneAndUpdate(
        { driver: order.driver, order: id },
        { order: null }
      );
    }

    // إرسال إشعارات الإلغاء
    try {
      await notificationService.updateOrderStatusNotifications(
        order, 
        order.status, 
        'cancelled'
      );
    } catch (notificationError) {
      console.error('❌ Notification error:', notificationError.message);
    }

    // تحديث إحصائيات المستخدم
    const user = await User.findById(userId);
    if (user && user.stats) {
      user.stats.cancelledOrders = (user.stats.cancelledOrders || 0) + 1;
      await user.save();
    }

    // إبطال الكاش
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
      message: 'فشل إلغاء الطلب',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 📍 الحصول على موقع المندوب
 * GET /api/orders/:id/location
 */
exports.getDriverLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // التحقق من أن الطلب يخص المستخدم
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

    // الحصول على موقع السائق
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

    res.json({
      success: true,
      data: {
        orderId: id,
        driverId: order.driver,
        location: {
          latitude: driverLocation.location.coordinates[1],
          longitude: driverLocation.location.coordinates[0]
        },
        updatedAt: driverLocation.updatedAt,
        driverInfo: await User.findById(order.driver).select('name phone image')
      }
    });
  } catch (error) {
    console.error('❌ Get driver location error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل جلب موقع المندوب',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 📊 الحصول على إحصائيات الطلبات (للأدمن)
 * GET /api/orders/stats
 */
exports.getOrderStats = async (req, res) => {
  try {
    // التحقق من صلاحية الأدمن
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
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalPrice' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          pendingOrders: {
            $sum: { $cond: [{ $in: ['$status', ['pending', 'accepted', 'picked']] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalOrders: 1,
          totalRevenue: 1,
          completedOrders: 1,
          pendingOrders: 1,
          cancelledOrders: 1,
          completionRate: {
            $cond: [
              { $eq: ['$totalOrders', 0] },
              0,
              { $multiply: [{ $divide: ['$completedOrders', '$totalOrders'] }, 100] }
            ]
          },
          avgOrderValue: {
            $cond: [
              { $eq: ['$totalOrders', 0] },
              0,
              { $divide: ['$totalRevenue', '$totalOrders'] }
            ]
          }
        }
      }
    ]);

    const response = {
      success: true,
      data: stats[0] || {
        totalOrders: 0,
        totalRevenue: 0,
        completedOrders: 0,
        pendingOrders: 0,
        cancelledOrders: 0,
        completionRate: 0,
        avgOrderValue: 0
      },
      timestamp: new Date(),
      filters: {
        startDate,
        endDate
      }
    };

    cache.set(cacheKey, response, 60);
    
    res.json(response);
  } catch (error) {
    console.error('❌ Get order stats error:', error.message);
    res.status(500).json({
      success: false,
      message: 'فشل جلب إحصائيات الطلبات',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};