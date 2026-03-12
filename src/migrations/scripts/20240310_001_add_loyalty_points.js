// ============================================
// ملف: src/migrations/scripts/20240310_001_add_loyalty_points.js
// الوصف: إضافة نقاط الولاء للمستخدمين
// ============================================

const mongoose = require('mongoose');
const User = require('../../models/user.model');
const Order = require('../../models/order.model');

module.exports = {
  name: '20240310_001_add_loyalty_points',
  description: 'إضافة نقاط الولاء للمستخدمين بناءً على تاريخ الطلبات',

  /**
   * ترقية: إضافة نقاط ولاء للمستخدمين
   */
  async up() {
    const affected = {
      users: 0,
      orders: 0
    };

    // حساب النقاط للمستخدمين بناءً على طلباتهم السابقة
    const users = await User.find({});

    for (const user of users) {
      // حساب مجموع الطلبات المكتملة
      const orders = await Order.find({
        user: user._id,
        status: 'delivered'
      });

      if (orders.length > 0) {
        // حساب النقاط: 1 نقطة لكل 10 وحدات عملة
        const totalSpent = orders.reduce((sum, order) => sum + order.totalPrice, 0);
        const points = Math.floor(totalSpent / 10);

        if (points > 0) {
          user.loyaltyPoints = points;
          
          // إضافة سجل المعاملات
          if (!user.loyaltyTransactions) {
            user.loyaltyTransactions = [];
          }

          user.loyaltyTransactions.push({
            type: 'earn',
            amount: points,
            reason: 'نقول ترحيبية من الطلبات السابقة',
            balance: points,
            timestamp: new Date()
          });

          await user.save();
          affected.users++;
          affected.orders += orders.length;

          console.log(`👤 مستخدم ${user.name}: ${points} نقطة من ${orders.length} طلب`);
        }
      }
    }

    return {
      affected,
      metadata: {
        totalUsers: await User.countDocuments(),
        usersWithPoints: affected.users
      }
    };
  },

  /**
   * الرجوع: إزالة نقاط الولاء
   */
  async down() {
    const affected = {
      users: 0
    };

    // إزالة نقاط الولاء
    await User.updateMany(
      { loyaltyPoints: { $gt: 0 } },
      { 
        $set: { loyaltyPoints: 0 },
        $unset: { loyaltyTransactions: 1 }
      }
    );

    affected.users = await User.countDocuments({ loyaltyPoints: 0 });

    return {
      affected,
      success: true
    };
  }
};