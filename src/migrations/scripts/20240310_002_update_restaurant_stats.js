// ============================================
// ملف: src/migrations/scripts/20240310_002_update_store_stats.js
// الوصف: تحديث إحصائيات المطاعم
// ============================================

const mongoose = require('mongoose');
const Store = require('../../models/store.model');
const Order = require('../../models/order.model');
const Review = require('../../models/review.model');

module.exports = {
  name: '20240310_002_update_store_stats',
  description: 'تحديث إحصائيات المطاعم (عدد الطلبات، الإيرادات، التقييمات)',

  /**
   * ترقية: حساب وتحديث إحصائيات المطاعم
   */
  async up() {
    const affected = {
      stores : 0
    };

    const stores  = await Store.find({});

    for (const store of stores ) {
      // حساب إحصائيات الطلبات
      const orderStats = await Order.aggregate([
        { $match: { store: store._id } },
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
        { $match: { store: store._id } },
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
        store.stats = {
          totalOrders: orderStats[0]?.totalOrders || 0,
          completedOrders: orderStats[0]?.completedOrders || 0,
          cancelledOrders: orderStats[0]?.cancelledOrders || 0,
          totalRevenue: orderStats[0]?.totalRevenue || 0,
          averageOrderValue: orderStats[0]?.avgOrderValue || 0,
          lastOrderDate: orderStats[0]?.lastOrderDate || null
        };

        if (reviewStats.length > 0) {
          store.averageRating = reviewStats[0].avgRating;
          store.ratingsCount = reviewStats[0].totalReviews;
        }

        await store.save();
        affected.stores ++;

        console.log(`🏪 مطعم ${store.name}: ${store.stats.totalOrders} طلب, ${store.stats.totalRevenue} إيرادات`);
      }
    }

    return {
      affected,
      metadata: {
        totalStores: await Store.countDocuments(),
        updated: affected.stores 
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