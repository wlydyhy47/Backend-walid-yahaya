const Order = require("../models/order.model");
const Restaurant = require("../models/restaurant.model");
const Item = require("../models/item.model");
const User = require("../models/user.model");
const cache = require("../utils/cache.util");
const PaginationUtils = require("../utils/pagination.util");

/**
 * 📊 لوحة تحكم صاحب المطعم
 * GET /api/restaurant-owner/dashboard
 */
exports.getDashboard = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const cacheKey = `restaurant_owner:dashboard:${restaurantId}`;

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, cached: true });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      // إحصائيات اليوم
      todayStats,
      // الطلبات المعلقة
      pendingOrders,
      // آخر الطلبات
      recentOrders,
      // الأصناف الأكثر مبيعاً
      topItems,
      // التقييمات
      reviews,
    ] = await Promise.all([
      // إحصائيات اليوم
      Order.aggregate([
        {
          $match: {
            restaurant: restaurantId,
            createdAt: { $gte: today },
          },
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$totalPrice" },
            avgOrderValue: { $avg: "$totalPrice" },
          },
        },
      ]),

      // الطلبات المعلقة
      Order.countDocuments({
        restaurant: restaurantId,
        status: { $in: ["pending", "accepted", "preparing"] },
      }),

      // آخر 10 طلبات
      Order.find({ restaurant: restaurantId })
        .populate("user", "name phone")
        .populate("driver", "name phone")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      // الأصناف الأكثر مبيعاً
      Order.aggregate([
        { $match: { restaurant: restaurantId, status: { $ne: "cancelled" } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            totalSold: { $sum: "$items.qty" },
            totalRevenue: { $sum: { $multiply: ["$items.price", "$items.qty"] } },
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 },
      ]),

      // التقييمات
      Review.find({ restaurant: restaurantId })
        .populate("user", "name")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    const responseData = {
      success: true,
      data: {
        today: todayStats[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
        pendingOrders,
        recentOrders,
        topItems,
        reviews,
        quickActions: {
          canAcceptOrders: true,
          hasPendingOrders: pendingOrders > 0,
        },
      },
      timestamp: new Date(),
    };

    cache.set(cacheKey, responseData, 60); // كاش دقيقة واحدة فقط (بيانات حية)

    res.json(responseData);
  } catch (error) {
    console.error("❌ Restaurant owner dashboard error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تحميل لوحة التحكم",
    });
  }
};

/**
 * 📋 عرض طلبات المطعم مع Pagination
 * GET /api/restaurant-owner/orders
 */
exports.getOrders = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;

    let query = { restaurant: restaurantId };

    // فلترة حسب الحالة
    if (filters.status) {
      query.status = filters.status;
    }

    // فلترة حسب التاريخ
    if (filters.dateFrom || filters.dateTo) {
      query.createdAt = {};
      if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
      if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("user", "name phone image")
        .populate("driver", "name phone")
        .populate("pickupAddress", "label addressLine city")
        .populate("deliveryAddress", "label addressLine city")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),

      Order.countDocuments(query),
    ]);

    // إحصائيات سريعة
    const stats = await Order.aggregate([
      { $match: { restaurant: restaurantId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          revenue: { $sum: "$totalPrice" },
        },
      },
    ]);

    const response = PaginationUtils.createPaginationResponse(
      orders,
      total,
      paginationOptions,
      {
        stats: stats.reduce((acc, curr) => {
          acc[curr._id] = { count: curr.count, revenue: curr.revenue };
          return acc;
        }, {}),
      }
    );

    res.json(response);
  } catch (error) {
    console.error("❌ Get restaurant orders error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب الطلبات",
    });
  }
};

/**
 * ✅ قبول/رفض طلب (من قبل صاحب المطعم)
 * PUT /api/restaurant-owner/orders/:orderId/status
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, estimatedTime, rejectionReason } = req.body;
    const restaurantId = req.restaurantId;

    const validStatuses = ["accepted", "rejected", "preparing", "ready"];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "حالة غير صالحة",
        validStatuses,
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      restaurant: restaurantId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود",
      });
    }

    // التحقق من تسلسل الحالات
    if (order.status === "cancelled" || order.status === "delivered") {
      return res.status(400).json({
        success: false,
        message: "لا يمكن تغيير حالة هذا الطلب",
      });
    }

    // تحديث الحالة
    order.status = status;
    
    if (estimatedTime) {
      order.estimatedPreparationTime = estimatedTime;
    }
    
    if (status === "rejected" && rejectionReason) {
      order.rejectionReason = rejectionReason;
    }

    await order.save();

    // إشعار العميل بالتحديث
    const notificationService = require("../services/notification.service");
    await notificationService.sendNotification({
      user: order.user,
      type: `order_${status}`,
      title: status === "accepted" ? "✅ تم قبول طلبك" : "❌ تم رفض طلبك",
      content: status === "accepted" 
        ? `تم قبول طلبك من المطعم، الوقت المتوقع: ${estimatedTime} دقيقة`
        : `تم رفض طلبك: ${rejectionReason}`,
      data: { orderId: order._id, status },
      priority: "high",
      link: `/orders/${order._id}`,
    });

    res.json({
      success: true,
      message: "تم تحديث حالة الطلب",
      data: {
        orderId: order._id,
        status: order.status,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ Update order status error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تحديث حالة الطلب",
    });
  }
};

/**
 * 🔔 تبديل حالة المطعم (مفتوح/مغلق)
 * PUT /api/restaurant-owner/toggle-status
 */
exports.toggleRestaurantStatus = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    
    const restaurant = await Restaurant.findById(restaurantId);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "المطعم غير موجود",
      });
    }

    // تبديل الحالة
    restaurant.isOpen = !restaurant.isOpen;
    await restaurant.save();

    // تحديث حالة المستخدم أيضاً
    await User.findByIdAndUpdate(req.user.id, {
      "restaurantOwnerInfo.isRestaurantOpen": restaurant.isOpen,
    });

    res.json({
      success: true,
      message: restaurant.isOpen ? "المطعم الآن مفتوح" : "المطعم الآن مغلق",
      data: {
        isOpen: restaurant.isOpen,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ Toggle status error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تغيير حالة المطعم",
    });
  }
};

/**
 * 📊 تقرير مالي مفصل
 * GET /api/restaurant-owner/reports/financial
 */
exports.getFinancialReport = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const { period = "month" } = req.query; // day, week, month, year

    let startDate = new Date();
    
    switch (period) {
      case "day":
        startDate.setDate(startDate.getDate() - 1);
        break;
      case "week":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case "year":
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const report = await Order.aggregate([
      {
        $match: {
          restaurant: restaurantId,
          createdAt: { $gte: startDate },
          status: { $in: ["delivered", "accepted"] },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          orders: { $sum: 1 },
          revenue: { $sum: "$totalPrice" },
          avgOrderValue: { $avg: "$totalPrice" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const summary = await Order.aggregate([
      {
        $match: {
          restaurant: restaurantId,
          createdAt: { $gte: startDate },
          status: { $in: ["delivered", "accepted"] },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$totalPrice" },
          avgOrderValue: { $avg: "$totalPrice" },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        period,
        summary: summary[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
        dailyBreakdown: report,
      },
    });
  } catch (error) {
    console.error("❌ Financial report error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل إنشاء التقرير",
    });
  }
};