// ============================================
// ملف: src/controllers/analytics.controller.js
// الوصف: تحليلات وإحصائيات متقدمة
// الإصدار: 1.0 (جديد)
// ============================================

const User = require("../models/user.model");
const Order = require("../models/order.model");
const Restaurant = require("../models/store.model");
const Item = require("../models/product.model");
const Review = require("../models/review.model");
const cache = require("../utils/cache.util");
const performanceService = require("../services/performance.service");
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة ==========

/**
 * تنسيق البيانات للرسوم البيانية
 */
const formatChartData = (data, dateField = '_id', valueField = 'count') => {
  return {
    labels: data.map(item => item[dateField]),
    values: data.map(item => item[valueField]),
    datasets: [{
      data: data.map(item => item[valueField]),
      backgroundColor: 'rgba(54, 162, 235, 0.5)',
      borderColor: 'rgba(54, 162, 235, 1)',
      borderWidth: 1
    }]
  };
};

/**
 * حساب النسبة المئوية للتغير
 */
const calculateChange = (current, previous) => {
  if (!previous || previous === 0) return { percentage: 100, trend: 'up' };
  const change = ((current - previous) / previous) * 100;
  return {
    percentage: Math.abs(change).toFixed(1),
    trend: change >= 0 ? 'up' : 'down'
  };
};

// ========== 2. تتبع الأحداث ==========

/**
 * @desc    تسجيل حدث تحليلي
 * @route   POST /api/analytics/events
 * @access  Public
 */
exports.trackEvent = async (req, res) => {
  try {
    const { eventName, category, action, label, value, ...properties } = req.body;

    // تسجيل الحدث (يمكن إرساله إلى خدمة تحليلات خارجية)
    console.log('📊 [Analytics Event]:', {
      eventName,
      category,
      action,
      label,
      value,
      properties,
      userId: req.user?.id || 'anonymous',
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // تخزين في الذاكرة للتحليل اللاحق
    if (!global.analyticsEvents) {
      global.analyticsEvents = [];
    }

    global.analyticsEvents.push({
      eventName,
      category,
      action,
      label,
      value,
      properties,
      userId: req.user?.id,
      timestamp: new Date(),
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // الحفاظ على آخر 1000 حدث فقط
    if (global.analyticsEvents.length > 1000) {
      global.analyticsEvents = global.analyticsEvents.slice(-1000);
    }

    res.json({
      success: true,
      message: 'Event tracked successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Track event error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track event"
    });
  }
};

/**
 * @desc    تسجيل أحداث متعددة
 * @route   POST /api/analytics/events/batch
 * @access  Public
 */
exports.trackBatchEvents = async (req, res) => {
  try {
    const { events = [] } = req.body;

    console.log(`📊 [Analytics Batch]: ${events.length} events received`);

    events.forEach((event, index) => {
      console.log(`  ${index + 1}. ${event.eventName || 'unknown'}`);
    });

    // تخزين في الذاكرة
    if (!global.analyticsEvents) {
      global.analyticsEvents = [];
    }

    events.forEach(event => {
      global.analyticsEvents.push({
        ...event,
        userId: req.user?.id,
        timestamp: new Date(),
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
    });

    // الحفاظ على آخر 1000 حدث
    if (global.analyticsEvents.length > 1000) {
      global.analyticsEvents = global.analyticsEvents.slice(-1000);
    }

    res.json({
      success: true,
      message: `${events.length} events tracked successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Track batch events error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track batch events"
    });
  }
};

/**
 * @desc    تعريف المستخدم
 * @route   POST /api/analytics/identify
 * @access  Authenticated
 */
exports.identifyUser = async (req, res) => {
  try {
    const { traits } = req.body;
    const userId = req.user.id;

    console.log('👤 [Analytics Identify]:', {
      userId,
      traits,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'User identified successfully',
      userId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Identify user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to identify user"
    });
  }
};

// ========== 3. إحصائيات الأداء (للأدمن) ==========

/**
 * @desc    الحصول على إحصائيات الأداء
 * @route   GET /api/analytics/performance/stats
 * @access  Admin
 */
exports.getPerformanceStats = async (req, res) => {
  try {
    const stats = performanceService.getStats();

    // إضافة إحصائيات إضافية
    const enhancedStats = {
      ...stats,
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid
      },
      events: {
        total: global.analyticsEvents?.length || 0,
        lastHour: global.analyticsEvents?.filter(e =>
          new Date(e.timestamp) > new Date(Date.now() - 60 * 60 * 1000)
        ).length || 0
      }
    };

    res.json({
      success: true,
      data: enhancedStats,
      timestamp: new Date()
    });
  } catch (error) {
    console.error("❌ Get performance stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get performance stats"
    });
  }
};

/**
 * @desc    الحصول على تقرير الأداء
 * @route   GET /api/analytics/performance/report
 * @access  Admin
 */
exports.getPerformanceReport = async (req, res) => {
  try {
    const report = performanceService.getReport();

    res.set('Content-Type', 'text/plain');
    res.send(report);
  } catch (error) {
    console.error("❌ Get performance report error:", error);
    res.status(500).send('Failed to get performance report');
  }
};

/**
 * @desc    إعادة تعيين إحصائيات الأداء
 * @route   POST /api/analytics/performance/reset
 * @access  Admin
 */
exports.resetPerformance = async (req, res) => {
  try {
    performanceService.reset();

    // إعادة تعيين الأحداث أيضاً
    global.analyticsEvents = [];

    res.json({
      success: true,
      message: 'Performance metrics reset successfully'
    });
  } catch (error) {
    console.error("❌ Reset performance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset performance stats"
    });
  }
};

// ========== 4. تحليلات الأعمال (للأدمن) ==========

/**
 * @desc    الحصول على نظرة عامة للوحة التحكم
 * @route   GET /api/analytics/dashboard/overview
 * @access  Admin
 */
exports.getDashboardOverview = async (req, res) => {
  try {
    const { period = 'week' } = req.query;

    const today = new Date();
    let startDate = new Date();

    switch (period) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(today.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(today.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(today.getFullYear() - 1);
        break;
      default:
        startDate.setDate(today.getDate() - 7);
    }

    const cacheKey = `analytics:dashboard:${period}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const [
      userStats,
      orderStats,
      restaurantStats,
      revenueStats,
      popularItems,
      topRestaurants
    ] = await Promise.all([
      // إحصائيات المستخدمين
      User.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            new: [
              { $match: { createdAt: { $gte: startDate } } },
              { $count: 'count' }
            ],
            active: [
              { $match: { lastLogin: { $gte: startDate } } },
              { $count: 'count' }
            ],
            byRole: [
              { $group: { _id: '$role', count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // إحصائيات الطلبات
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $facet: {
            total: [{ $count: 'count' }],
            revenue: [{ $group: { _id: null, total: { $sum: '$totalPrice' } } }],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            byDay: [
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                  count: { $sum: 1 },
                  revenue: { $sum: '$totalPrice' }
                }
              },
              { $sort: { _id: 1 } }
            ]
          }
        }
      ]),

      // إحصائيات المطاعم
      Restaurant.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            new: [
              { $match: { createdAt: { $gte: startDate } } },
              { $count: 'count' }
            ],
            byType: [
              { $group: { _id: '$type', count: { $sum: 1 } } }
            ],
            topRated: [
              { $sort: { averageRating: -1 } },
              { $limit: 5 },
              { $project: { name: 1, averageRating: 1, ratingsCount: 1 } }
            ]
          }
        }
      ]),

      // إحصائيات الإيرادات
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
            avgOrderValue: { $avg: '$totalPrice' },
            maxOrder: { $max: '$totalPrice' },
            minOrder: { $min: '$totalPrice' }
          }
        }
      ]),

      // الأصناف الأكثر مبيعاً
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
            _id: '$items.name',
            quantity: { $sum: '$items.qty' },
            revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } }
          }
        },
        { $sort: { quantity: -1 } },
        { $limit: 10 }
      ]),

      // أفضل المطاعم أداءً
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            status: 'delivered'
          }
        },
        {
          $group: {
            _id: '$restaurant',
            orders: { $sum: 1 },
            revenue: { $sum: '$totalPrice' }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'restaurants',
            localField: '_id',
            foreignField: '_id',
            as: 'restaurantInfo'
          }
        }
      ])
    ]);

    const responseData = {
      period,
      dateRange: {
        from: startDate,
        to: today
      },
      users: {
        total: userStats[0]?.total[0]?.count || 0,
        new: userStats[0]?.new[0]?.count || 0,
        active: userStats[0]?.active[0]?.count || 0,
        byRole: userStats[0]?.byRole || []
      },
      orders: {
        total: orderStats[0]?.total[0]?.count || 0,
        revenue: orderStats[0]?.revenue[0]?.total || 0,
        byStatus: orderStats[0]?.byStatus || [],
        chart: formatChartData(orderStats[0]?.byDay || [], '_id', 'count')
      },
      restaurants: {
        total: restaurantStats[0]?.total[0]?.count || 0,
        new: restaurantStats[0]?.new[0]?.count || 0,
        byType: restaurantStats[0]?.byType || [],
        topRated: restaurantStats[0]?.topRated || []
      },
      revenue: {
        total: revenueStats[0]?.total || 0,
        avgOrderValue: revenueStats[0]?.avgOrderValue || 0,
        maxOrder: revenueStats[0]?.maxOrder || 0,
        minOrder: revenueStats[0]?.minOrder || 0
      },
      popularItems,
      topRestaurants: topRestaurants.map(r => ({
        ...r,
        name: r.restaurantInfo[0]?.name || 'Unknown'
      }))
    };

    cache.set(cacheKey, responseData, 600); // 10 دقائق

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("❌ Get dashboard overview error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get dashboard overview"
    });
  }
};

/**
 * @desc    تحليلات المستخدمين
 * @route   GET /api/analytics/users
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
    console.error("❌ Get user analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user analytics"
    });
  }
};

/**
 * @desc    تحليلات الطلبات
 * @route   GET /api/analytics/orders
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
    console.error("❌ Get order analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get order analytics"
    });
  }
};

/**
 * @desc    تحليلات الإيرادات
 * @route   GET /api/analytics/revenue
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
    console.error("❌ Get revenue analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get revenue analytics"
    });
  }
};

module.exports = exports;