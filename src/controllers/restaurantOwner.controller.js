// ============================================
// ملف: src/controllers/restaurantOwner.controller.js
// الوصف: لوحة تحكم صاحب المطعم (موحد مع العناوين)
// الإصدار: 3.0 (موحد)
// ============================================

const Order = require("../models/order.model");
const Restaurant = require("../models/restaurant.model");
const RestaurantAddress = require("../models/restaurantAddress.model");
const Item = require("../models/item.model");
const User = require("../models/user.model");
const Review = require("../models/review.model");
const cache = require("../utils/cache.util");
const PaginationUtils = require("../utils/pagination.util");
const notificationService = require("../services/notification.service");
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة ==========

/**
 * إبطال كاش صاحب المطعم
 */
const invalidateOwnerCache = (restaurantId, ownerId) => {
  cache.del(`restaurant_owner:dashboard:${restaurantId}`);
  cache.del(`restaurant_owner:stats:${restaurantId}`);
  cache.invalidatePattern(`restaurant_owner:orders:${restaurantId}:*`);
  cache.del(`user:complete:${ownerId}`);
  cache.del(`restaurant:complete:${restaurantId}`);
  cache.invalidatePattern('restaurants:*');
};

/**
 * التحقق من ملكية المطعم
 */
const checkOwnership = async (restaurantId, ownerId) => {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    throw new AppError('المطعم غير موجود', 404);
  }

  const owner = await User.findById(ownerId);
  if (!owner || owner.restaurantOwnerInfo?.restaurant?.toString() !== restaurantId) {
    throw new AppError('غير مصرح لك بالوصول إلى هذا المطعم', 403);
  }

  return { restaurant, owner };
};

// ========== 2. لوحة التحكم ==========

/**
 * @desc    لوحة تحكم صاحب المطعم
 * @route   GET /api/restaurant-owner/dashboard
 * @access  Restaurant Owner
 */
exports.getDashboard = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const cacheKey = `restaurant_owner:dashboard:${restaurantId}`;

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

    const [
      todayStats,
      pendingOrders,
      recentOrders,
      topItems,
      recentReviews,
      weeklyStats,
      monthlyStats
    ] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            restaurant: restaurantId,
            createdAt: { $gte: today }
          }
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$totalPrice" },
            avgOrderValue: { $avg: "$totalPrice" }
          }
        }
      ]),

      Order.countDocuments({
        restaurant: restaurantId,
        status: { $in: ["pending", "accepted"] }
      }),

      Order.find({ restaurant: restaurantId })
        .populate("user", "name phone")
        .populate("driver", "name phone")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      Order.aggregate([
        { $match: { restaurant: restaurantId, status: { $ne: "cancelled" } } },
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
      ]),

      Review.find({ restaurant: restaurantId })
        .populate("user", "name image")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      Order.aggregate([
        {
          $match: {
            restaurant: restaurantId,
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            orders: { $sum: 1 },
            revenue: { $sum: "$totalPrice" }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      Order.aggregate([
        {
          $match: {
            restaurant: restaurantId,
            createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
          }
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$totalPrice" },
            completedOrders: {
              $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] }
            }
          }
        }
      ])
    ]);

    const chartData = {
      labels: weeklyStats.map(day => day._id),
      orders: weeklyStats.map(day => day.orders),
      revenue: weeklyStats.map(day => day.revenue)
    };

    const responseData = {
      summary: {
        today: todayStats[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
        pending: pendingOrders,
        monthly: monthlyStats[0] || { totalOrders: 0, totalRevenue: 0, completedOrders: 0 }
      },
      recentOrders,
      topItems,
      recentReviews,
      charts: chartData,
      quickActions: {
        canAcceptOrders: true,
        hasPendingOrders: pendingOrders > 0,
        isOpen: true
      },
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 60);

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("❌ Restaurant owner dashboard error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تحميل لوحة التحكم"
    });
  }
};

// ========== 3. إدارة الطلبات ==========

/**
 * @desc    عرض طلبات المطعم مع Pagination
 * @route   GET /api/restaurant-owner/orders
 * @access  Restaurant Owner
 */
exports.getOrders = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, filters } = paginationOptions;

    let query = { restaurant: restaurantId };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.dateFrom || filters.dateTo) {
      query.createdAt = {};
      if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
      if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
    }

    if (filters.customer) {
      query.user = filters.customer;
    }

    const cacheKey = `restaurant_owner:orders:${restaurantId}:${JSON.stringify(query)}:${skip}:${limit}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true
      });
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

      Order.countDocuments(query)
    ]);

    const stats = await Order.aggregate([
      { $match: { restaurant: restaurantId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          revenue: { $sum: "$totalPrice" }
        }
      }
    ]);

    const statsByStatus = stats.reduce((acc, curr) => {
      acc[curr._id] = { count: curr.count, revenue: curr.revenue };
      return acc;
    }, {});

    const response = PaginationUtils.createPaginationResponse(
      orders,
      total,
      paginationOptions,
      { stats: statsByStatus }
    );

    cache.set(cacheKey, response, 30);

    res.json(response);
  } catch (error) {
    console.error("❌ Get restaurant orders error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل جلب الطلبات"
    });
  }
};

/**
 * @desc    تحديث حالة الطلب
 * @route   PUT /api/restaurant-owner/orders/:orderId/status
 * @access  Restaurant Owner
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, estimatedTime, rejectionReason } = req.body;
    const restaurantId = req.restaurantId;
    const userId = req.user.id;

    const validStatuses = ["accepted", "rejected", "preparing", "ready"];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "حالة غير صالحة",
        validStatuses
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      restaurant: restaurantId
    }).populate('user', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود"
      });
    }

    if (order.status === "cancelled" || order.status === "delivered") {
      return res.status(400).json({
        success: false,
        message: "لا يمكن تغيير حالة هذا الطلب"
      });
    }

    const oldStatus = order.status;

    order.status = status;
    
    if (estimatedTime) {
      order.estimatedPreparationTime = estimatedTime;
    }
    
    if (status === "rejected" && rejectionReason) {
      order.rejectionReason = rejectionReason;
      order.cancelledBy = userId;
      order.cancelledAt = new Date();
    }

    await order.save();

    await notificationService.sendNotification({
      user: order.user._id,
      type: `order_${status}`,
      title: status === "accepted" ? "✅ تم قبول طلبك" : 
             status === "rejected" ? "❌ تم رفض طلبك" : 
             "📦 تحديث على طلبك",
      content: status === "accepted" 
        ? `تم قبول طلبك، الوقت المتوقع: ${estimatedTime || order.estimatedPreparationTime} دقيقة`
        : status === "rejected"
        ? `تم رفض طلبك: ${rejectionReason}`
        : status === "preparing"
        ? "جاري تحضير طلبك"
        : "طلبك جاهز للتسليم",
      data: { orderId: order._id, status },
      priority: "high",
      link: `/orders/${order._id}`,
      icon: status === "accepted" ? "✅" : status === "rejected" ? "❌" : "📦",
      tags: ["order", `order_${order._id}`]
    });

    cache.del(`restaurant_owner:dashboard:${restaurantId}`);
    cache.invalidatePattern(`restaurant_owner:orders:${restaurantId}:*`);
    cache.del(`order:full:${orderId}`);

    res.json({
      success: true,
      message: "تم تحديث حالة الطلب",
      data: {
        orderId: order._id,
        oldStatus,
        newStatus: status,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error("❌ Update order status error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تحديث حالة الطلب"
    });
  }
};

/**
 * @desc    قبول طلب
 * @route   PUT /api/restaurant-owner/orders/:orderId/accept
 * @access  Restaurant Owner
 */
exports.acceptOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { estimatedTime } = req.body;
    const restaurantId = req.restaurantId;

    const order = await Order.findOne({
      _id: orderId,
      restaurant: restaurantId,
      status: "pending"
    }).populate('user', 'name phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود أو تم التعامل معه مسبقاً"
      });
    }

    order.status = "accepted";
    if (estimatedTime) {
      order.estimatedPreparationTime = estimatedTime;
    }
    await order.save();

    await notificationService.sendNotification({
      user: order.user._id,
      type: "order_accepted",
      title: "✅ تم قبول طلبك",
      content: `تم قبول طلبك، الوقت المتوقع: ${estimatedTime || order.estimatedPreparationTime} دقيقة`,
      data: { orderId: order._id },
      priority: "high",
      link: `/orders/${order._id}`,
      icon: "✅"
    });

    cache.del(`restaurant_owner:dashboard:${restaurantId}`);
    cache.invalidatePattern(`restaurant_owner:orders:${restaurantId}:*`);

    res.json({
      success: true,
      message: "تم قبول الطلب بنجاح",
      data: {
        orderId: order._id,
        status: order.status,
        estimatedTime: estimatedTime || order.estimatedPreparationTime
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
 * @desc    رفض طلب
 * @route   PUT /api/restaurant-owner/orders/:orderId/reject
 * @access  Restaurant Owner
 */
exports.rejectOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const restaurantId = req.restaurantId;
    const userId = req.user.id;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "يرجى تقديم سبب الرفض (5 أحرف على الأقل)"
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      restaurant: restaurantId,
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

    cache.del(`restaurant_owner:dashboard:${restaurantId}`);
    cache.invalidatePattern(`restaurant_owner:orders:${restaurantId}:*`);

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

// ========== 4. إدارة المطعم ==========

/**
 * @desc    تبديل حالة المطعم (مفتوح/مغلق)
 * @route   PUT /api/restaurant-owner/toggle-status
 * @access  Restaurant Owner
 */
exports.toggleRestaurantStatus = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const userId = req.user.id;
    
    const restaurant = await Restaurant.findById(restaurantId);
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "المطعم غير موجود"
      });
    }

    restaurant.isOpen = !restaurant.isOpen;
    await restaurant.save();

    await User.findByIdAndUpdate(userId, {
      "restaurantOwnerInfo.isRestaurantOpen": restaurant.isOpen
    });

    cache.del(`restaurant_owner:dashboard:${restaurantId}`);
    cache.del(`restaurant:complete:${restaurantId}`);
    cache.invalidatePattern('restaurants:*');

    res.json({
      success: true,
      message: restaurant.isOpen ? "المطعم الآن مفتوح" : "المطعم الآن مغلق",
      data: {
        isOpen: restaurant.isOpen,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error("❌ Toggle status error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تغيير حالة المطعم"
    });
  }
};

/**
 * @desc    تحديث وقت التحضير التقديري
 * @route   PUT /api/restaurant-owner/preparation-time
 * @access  Restaurant Owner
 */
exports.updatePreparationTime = async (req, res) => {
  try {
    const { time } = req.body;
    const restaurantId = req.restaurantId;

    if (!time || time < 5 || time > 120) {
      return res.status(400).json({
        success: false,
        message: "وقت التحضير يجب أن يكون بين 5 و 120 دقيقة"
      });
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { estimatedDeliveryTime: time },
      { new: true }
    );

    cache.del(`restaurant:complete:${restaurantId}`);
    cache.invalidatePattern('restaurants:*');

    res.json({
      success: true,
      message: "تم تحديث وقت التحضير",
      data: {
        estimatedDeliveryTime: restaurant.estimatedDeliveryTime
      }
    });
  } catch (error) {
    console.error("❌ Update preparation time error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تحديث وقت التحضير"
    });
  }
};

// ========== 5. التقارير ==========

/**
 * @desc    تقرير مالي مفصل
 * @route   GET /api/restaurant-owner/reports/financial
 * @access  Restaurant Owner
 */
exports.getFinancialReport = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const { period = "month" } = req.query;

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
      default:
        startDate.setMonth(startDate.getMonth() - 1);
    }

    const cacheKey = `restaurant_owner:financial:${restaurantId}:${period}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const report = await Order.aggregate([
      {
        $match: {
          restaurant: restaurantId,
          createdAt: { $gte: startDate },
          status: { $in: ["delivered", "accepted"] }
        }
      },
      {
        $facet: {
          daily: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                orders: { $sum: 1 },
                revenue: { $sum: "$totalPrice" },
                avgOrderValue: { $avg: "$totalPrice" }
              }
            },
            { $sort: { _id: 1 } }
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: "$totalPrice" },
                avgOrderValue: { $avg: "$totalPrice" },
                minOrder: { $min: "$totalPrice" },
                maxOrder: { $max: "$totalPrice" }
              }
            }
          ],
          byStatus: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                revenue: { $sum: "$totalPrice" }
              }
            }
          ],
          popularItems: [
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.name",
                quantity: { $sum: "$items.qty" },
                revenue: { $sum: { $multiply: ["$items.price", "$items.qty"] } }
              }
            },
            { $sort: { quantity: -1 } },
            { $limit: 10 }
          ]
        }
      }
    ]);

    const responseData = {
      period,
      dateRange: {
        from: startDate,
        to: new Date()
      },
      summary: report[0]?.summary[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
      daily: report[0]?.daily || [],
      byStatus: report[0]?.byStatus || [],
      popularItems: report[0]?.popularItems || []
    };

    cache.set(cacheKey, responseData, 600);

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("❌ Financial report error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل إنشاء التقرير"
    });
  }
};

/**
 * @desc    تقرير الأداء
 * @route   GET /api/restaurant-owner/reports/performance
 * @access  Restaurant Owner
 */
exports.getPerformanceReport = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;

    const report = await Order.aggregate([
      { $match: { restaurant: restaurantId } },
      {
        $facet: {
          completionRate: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                completed: {
                  $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] }
                },
                cancelled: {
                  $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] }
                }
              }
            },
            {
              $project: {
                completionRate: { $multiply: [{ $divide: ["$completed", "$total"] }, 100] },
                cancellationRate: { $multiply: [{ $divide: ["$cancelled", "$total"] }, 100] }
              }
            }
          ],
          avgPreparationTime: [
            {
              $match: { status: "delivered" }
            },
            {
              $group: {
                _id: null,
                avgTime: { $avg: "$estimatedPreparationTime" }
              }
            }
          ],
          customerSatisfaction: [
            {
              $lookup: {
                from: "reviews",
                localField: "_id",
                foreignField: "order",
                as: "review"
              }
            },
            { $unwind: "$review" },
            {
              $group: {
                _id: null,
                avgRating: { $avg: "$review.rating" },
                totalReviews: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        completionRate: report[0]?.completionRate[0] || { completionRate: 0, cancellationRate: 0 },
        avgPreparationTime: report[0]?.avgPreparationTime[0]?.avgTime || 0,
        customerSatisfaction: report[0]?.customerSatisfaction[0] || { avgRating: 0, totalReviews: 0 }
      }
    });
  } catch (error) {
    console.error("❌ Performance report error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل إنشاء تقرير الأداء"
    });
  }
};

// ========== 6. الإعدادات ==========

/**
 * @desc    الحصول على الإعدادات
 * @route   GET /api/restaurant-owner/settings
 * @access  Restaurant Owner
 */
exports.getSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("restaurantOwnerInfo.notificationSettings restaurantOwnerInfo.workingHours")
      .lean();
    
    const restaurant = await Restaurant.findById(req.restaurantId)
      .select("isOpen estimatedDeliveryTime minOrderAmount deliveryFee")
      .lean();

    res.json({
      success: true,
      data: {
        notifications: user?.restaurantOwnerInfo?.notificationSettings || {},
        workingHours: user?.restaurantOwnerInfo?.workingHours || {},
        restaurant: {
          isOpen: restaurant?.isOpen,
          estimatedDeliveryTime: restaurant?.estimatedDeliveryTime,
          minOrderAmount: restaurant?.minOrderAmount,
          deliveryFee: restaurant?.deliveryFee
        }
      }
    });
  } catch (error) {
    console.error("❌ Get settings error:", error);
    res.status(500).json({ 
      success: false,
      message: "فشل جلب الإعدادات" 
    });
  }
};

/**
 * @desc    تحديث إعدادات الإشعارات
 * @route   PUT /api/restaurant-owner/settings/notifications
 * @access  Restaurant Owner
 */
exports.updateNotificationSettings = async (req, res) => {
  try {
    const { notificationSettings } = req.body;
    
    await User.findByIdAndUpdate(req.user.id, {
      "restaurantOwnerInfo.notificationSettings": notificationSettings
    });

    cache.del(`user:complete:${req.user.id}`);

    res.json({
      success: true,
      message: "تم تحديث إعدادات الإشعارات"
    });
  } catch (error) {
    console.error("❌ Update notification settings error:", error);
    res.status(500).json({ 
      success: false,
      message: "فشل تحديث الإعدادات" 
    });
  }
};

/**
 * @desc    تحديث ساعات العمل
 * @route   PUT /api/restaurant-owner/settings/working-hours
 * @access  Restaurant Owner
 */
exports.updateWorkingHours = async (req, res) => {
  try {
    const { workingHours } = req.body;
    
    await User.findByIdAndUpdate(req.user.id, {
      "restaurantOwnerInfo.workingHours": workingHours
    });

    cache.del(`user:complete:${req.user.id}`);

    res.json({
      success: true,
      message: "تم تحديث ساعات العمل"
    });
  } catch (error) {
    console.error("❌ Update working hours error:", error);
    res.status(500).json({ 
      success: false,
      message: "فشل تحديث ساعات العمل" 
    });
  }
};

// ========== 7. دوال العناوين (من restaurantAddress.controller.js) ==========

/**
 * @desc    إنشاء عنوان مطعم
 * @route   POST /api/restaurant-owner/addresses
 * @access  Restaurant Owner / Admin
 */
exports.createAddress = async (req, res) => {
  try {
    const { restaurantId, addressLine, city, latitude, longitude } = req.body;
    
    const targetRestaurantId = restaurantId || req.restaurantId;

    const restaurant = await Restaurant.findById(targetRestaurantId);
    if (!restaurant) {
      return res.status(404).json({ 
        success: false,
        message: "Restaurant not found" 
      });
    }

    if (req.user.role !== 'admin' && restaurant.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بإضافة عنوان لهذا المطعم"
      });
    }

    const address = await RestaurantAddress.create({
      restaurant: targetRestaurantId,
      addressLine,
      city: city || "Niamey",
      latitude,
      longitude
    });

    invalidateOwnerCache(targetRestaurantId, req.user.id);

    res.status(201).json({
      success: true,
      message: "Address created successfully",
      data: address
    });
  } catch (error) {
    console.error("❌ Error in createAddress:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to create restaurant address" 
    });
  }
};

/**
 * @desc    جلب عناوين مطعم
 * @route   GET /api/restaurant-owner/addresses
 * @access  Restaurant Owner
 */
exports.getMyAddresses = async (req, res) => {
  try {
    const restaurantId = req.restaurantId;

    const addresses = await RestaurantAddress.find({
      restaurant: restaurantId
    }).lean();

    res.json({
      success: true,
      data: addresses
    });
  } catch (error) {
    console.error("❌ Error in getAddresses:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch restaurant addresses" 
    });
  }
};

/**
 * @desc    تحديث عنوان مطعم
 * @route   PUT /api/restaurant-owner/addresses/:id
 * @access  Restaurant Owner
 */
exports.updateMyAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { addressLine, city, latitude, longitude } = req.body;
    const restaurantId = req.restaurantId;

    const address = await RestaurantAddress.findOne({
      _id: id,
      restaurant: restaurantId
    });
    
    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found or not owned by you"
      });
    }

    if (addressLine) address.addressLine = addressLine;
    if (city) address.city = city;
    if (latitude !== undefined) address.latitude = latitude;
    if (longitude !== undefined) address.longitude = longitude;

    await address.save();

    invalidateOwnerCache(restaurantId, req.user.id);

    res.json({
      success: true,
      message: "Address updated successfully",
      data: address
    });
  } catch (error) {
    console.error("❌ Error in updateAddress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update address"
    });
  }
};

/**
 * @desc    حذف عنوان مطعم
 * @route   DELETE /api/restaurant-owner/addresses/:id
 * @access  Restaurant Owner
 */
exports.deleteMyAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.restaurantId;

    const address = await RestaurantAddress.findOne({
      _id: id,
      restaurant: restaurantId
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found or not owned by you"
      });
    }

    await address.deleteOne();

    invalidateOwnerCache(restaurantId, req.user.id);

    res.json({
      success: true,
      message: "Address deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error in deleteAddress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete address"
    });
  }
};

/**
 * @desc    الحصول على عنوان محدد
 * @route   GET /api/restaurant-owner/addresses/:id
 * @access  Restaurant Owner
 */
exports.getMyAddressById = async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.restaurantId;

    const address = await RestaurantAddress.findOne({
      _id: id,
      restaurant: restaurantId
    })
      .populate('restaurant', 'name image')
      .lean();

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    res.json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error("❌ Error in getAddressById:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch address"
    });
  }
};

// ========== 8. دوال إضافية للعناوين (للمسؤولين) ==========

/**
 * @desc    الحصول على عناوين مطعم (للمسؤولين)
 * @route   GET /api/restaurants/:restaurantId/addresses
 * @access  Admin
 */
exports.getAddresses = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const addresses = await RestaurantAddress.find({
      restaurant: restaurantId
    }).lean();

    res.json({
      success: true,
      data: addresses
    });
  } catch (error) {
    console.error("❌ Error in getAddresses:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch restaurant addresses" 
    });
  }
};

/**
 * @desc    تحديث عنوان مطعم (للمسؤولين)
 * @route   PUT /api/restaurants/addresses/:id
 * @access  Admin
 */
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { addressLine, city, latitude, longitude } = req.body;

    const address = await RestaurantAddress.findById(id);
    
    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    if (addressLine) address.addressLine = addressLine;
    if (city) address.city = city;
    if (latitude !== undefined) address.latitude = latitude;
    if (longitude !== undefined) address.longitude = longitude;

    await address.save();

    cache.del(`restaurant:complete:${address.restaurant}`);
    cache.invalidatePattern('restaurants:*');

    res.json({
      success: true,
      message: "Address updated successfully",
      data: address
    });
  } catch (error) {
    console.error("❌ Error in updateAddress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update address"
    });
  }
};

/**
 * @desc    حذف عنوان مطعم (للمسؤولين)
 * @route   DELETE /api/restaurants/addresses/:id
 * @access  Admin
 */
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await RestaurantAddress.findById(id);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    const restaurantId = address.restaurant;
    await address.deleteOne();

    cache.del(`restaurant:complete:${restaurantId}`);
    cache.invalidatePattern('restaurants:*');

    res.json({
      success: true,
      message: "Address deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error in deleteAddress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete address"
    });
  }
};

/**
 * @desc    الحصول على عنوان محدد (للمسؤولين)
 * @route   GET /api/restaurants/addresses/:id
 * @access  Admin
 */
exports.getAddressById = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await RestaurantAddress.findById(id)
      .populate('restaurant', 'name image')
      .lean();

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    res.json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error("❌ Error in getAddressById:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch address"
    });
  }
};

module.exports = exports;