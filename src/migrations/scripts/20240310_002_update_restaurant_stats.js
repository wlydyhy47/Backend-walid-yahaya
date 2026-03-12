// ============================================
// ملف: src/migrations/scripts/20240310_002_update_restaurant_stats.js
// الوصف: تحديث إحصائيات المطاعم
// ============================================

const mongoose = require('mongoose');
const Restaurant = require('../../models/restaurant.model');
const Order = require('../../models/order.model');
const Review = require('../../models/review.model');

module.exports = {
  name: '20240310_002_update_restaurant_stats',
  description: 'تحديث إحصائيات المطاعم (عدد الطلبات، الإيرادات، التقييمات)',

  /**
   * ترقية: حساب وتحديث إحصائيات المطاعم
   */
  async up() {
    const affected = {
      restaurants: 0
    };

    const restaurants = await Restaurant.find({});

    for (const restaurant of restaurants) {
      // حساب إحصائيات الطلبات
      const orderStats = await Order.aggregate([
        { $match: { restaurant: restaurant._id } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
            },
            cancelledOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
            },
            totalRevenue: { $sum: '$totalPrice' },
            avgOrderValue: { $avg: '$totalPrice' },
            lastOrderDate: { $max: '$createdAt' }
          }
        }
      ]);

      // حساب التقييمات
      const reviewStats = await Review.aggregate([
        { $match: { restaurant: restaurant._id } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 }
          }
        }
      ]);

      if (orderStats.length > 0 || reviewStats.length > 0) {
        // تحديث إحصائيات المطعم
        restaurant.stats = {
          totalOrders: orderStats[0]?.totalOrders || 0,
          completedOrders: orderStats[0]?.completedOrders || 0,
          cancelledOrders: orderStats[0]?.cancelledOrders || 0,
          totalRevenue: orderStats[0]?.totalRevenue || 0,
          averageOrderValue: orderStats[0]?.avgOrderValue || 0,
          lastOrderDate: orderStats[0]?.lastOrderDate || null
        };

        if (reviewStats.length > 0) {
          restaurant.averageRating = reviewStats[0].avgRating;
          restaurant.ratingsCount = reviewStats[0].totalReviews;
        }

        await restaurant.save();
        affected.restaurants++;

        console.log(`🏪 مطعم ${restaurant.name}: ${restaurant.stats.totalOrders} طلب, ${restaurant.stats.totalRevenue} إيرادات`);
      }
    }

    return {
      affected,
      metadata: {
        totalRestaurants: await Restaurant.countDocuments(),
        updated: affected.restaurants
      }
    };
  },

  /**
   * الرجوع: لا يمكن الرجوع عن الإحصائيات المحسوبة
   */
  async down() {
    return {
      success: true,
      message: 'لا يمكن الرجوع عن الإحصائيات المحسوبة'
    };
  }
};