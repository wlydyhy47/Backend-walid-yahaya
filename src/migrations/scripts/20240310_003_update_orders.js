// ============================================
// ملف: src/migrations/scripts/20240310_003_update_orders.js
// الوصف: تحديث بيانات الطلبات (إضافة حقول جديدة)
// ============================================

const mongoose = require('mongoose');
const Order = require('../../models/order.model');

module.exports = {
  name: '20240310_003_update_orders',
  description: 'تحديث الطلبات - إضافة حقول deliveryTime, notes, cancellationReason',

  /**
   * ترقية: تحديث الطلبات القديمة
   */
  async up() {
    const affected = {
      orders: 0,
      delivered: 0,
      cancelled: 0
    };

    // تحديث الطلبات المكتملة - حساب وقت التوصيل
    const deliveredOrders = await Order.find({
      status: 'delivered',
      deliveryTime: { $exists: false }
    });

    for (const order of deliveredOrders) {
      if (order.createdAt && order.updatedAt) {
        const deliveryTime = Math.round((order.updatedAt - order.createdAt) / 60000); // بالدقائق
        order.deliveryTime = deliveryTime;
        order.deliveredAt = order.updatedAt;
        await order.save();
        affected.delivered++;
        affected.orders++;
      }
    }

    // تحديث الطلبات الملغاة - إضافة سبب إلغاء افتراضي
    const cancelledOrders = await Order.find({
      status: 'cancelled',
      cancellationReason: { $exists: false }
    });

    for (const order of cancelledOrders) {
      order.cancellationReason = 'تم الإلغاء بواسطة النظام (ترقية)';
      order.cancelledAt = order.updatedAt;
      await order.save();
      affected.cancelled++;
      affected.orders++;
    }

    return {
      affected,
      metadata: {
        totalDelivered: await Order.countDocuments({ status: 'delivered' }),
        totalCancelled: await Order.countDocuments({ status: 'cancelled' })
      }
    };
  },

  /**
   * الرجوع: إزالة الحقول المضافة
   */
  async down() {
    const affected = {
      orders: 0
    };

    // إزالة الحقول المضافة
    await Order.updateMany(
      {},
      {
        $unset: {
          deliveryTime: 1,
          deliveredAt: 1,
          cancellationReason: 1,
          cancelledAt: 1
        }
      }
    );

    affected.orders = await Order.countDocuments({});

    return {
      affected,
      success: true
    };
  }
};