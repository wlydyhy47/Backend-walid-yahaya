// ============================================
// ملف: src/models/order.model.js (محدث وآمن)
// الوصف: نموذج الطلب مع دمج الـ items
// ============================================

const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },

    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'wallet'],
      default: 'cash',
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },

    paymentDetails: {
      transactionId: String,
      paymentIntent: String,
      paidAt: Date,
    },

    items: [
      {
        name: {
          type: String,
          required: true,
        },
        qty: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        item: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        notes: String,
        category: String,
        options: [{
          name: String,
          choice: String,
          price: Number
        }]
      },
    ],

    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    estimatedDistance: {
      type: Number,
      min: 0,
    },

    estimatedDeliveryTime: {
      type: Number,
      default: 30,
    },

    estimatedPreparationTime: {
      type: Number,
      default: 15,
    },

    deliveryTime: {
      type: Number,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    cancellationReason: {
      type: String,
      trim: true,
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    cancelledAt: Date,

    deliveredAt: Date,

    pickupAddress: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },

    deliveryAddress: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "ready", "picked", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ========== Indexes ==========
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ driver: 1, status: 1 });
orderSchema.index({ store: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

// ========== Virtuals (آمنة) ==========

/**
 * إجمالي عدد العناصر - ✅ آمن
 */
orderSchema.virtual("totalItems").get(function () {
  // التحقق من وجود items قبل استخدام reduce
  if (!this.items || !Array.isArray(this.items) || this.items.length === 0) {
    return 0;
  }
  return this.items.reduce((sum, item) => sum + (item.qty || 0), 0);
});

/**
 * إجمالي السعر الفرعي (من العناصر) - ✅ آمن
 */
orderSchema.virtual("subtotal").get(function () {
  if (!this.items || !Array.isArray(this.items) || this.items.length === 0) {
    return 0;
  }
  return this.items.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 0)), 0);
});

/**
 * عدد العناصر المختلفة - ✅ آمن
 */
orderSchema.virtual("itemCount").get(function () {
  if (!this.items || !Array.isArray(this.items)) {
    return 0;
  }
  return this.items.length;
});

/**
 * هل يمكن إلغاء الطلب - ✅ آمن
 */
orderSchema.virtual("canCancel").get(function () {
  return this.status && ["pending", "accepted"].includes(this.status);
});

/**
 * هل يمكن تحديث الحالة - ✅ آمن
 */
orderSchema.virtual("canUpdateStatus").get(function () {
  return this.status && this.status !== "cancelled" && this.status !== "delivered";
});

/**
 * وقت الطلب منذ إنشائه - ✅ آمن
 */
orderSchema.virtual("timeSinceCreation").get(function () {
  if (!this.createdAt) return 0;
  const now = new Date();
  const diffMs = now - this.createdAt;
  return Math.round(diffMs / 60000);
});

/**
 * نص الحالة بالعربية - ✅ آمن
 */
orderSchema.virtual("statusText").get(function () {
  const statusMap = {
    pending: 'قيد الانتظار',
    accepted: 'تم القبول',
    ready: 'جاهز',
    picked: 'تم الاستلام',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي'
  };
  return statusMap[this.status] || this.status || 'غير معروف';
});

/**
 * السعر الإجمالي منسق - ✅ آمن
 */
orderSchema.virtual("formattedTotal").get(function () {
  const total = this.totalPrice || 0;
  return `${total.toFixed(2)} د.ع`;
});

/**
 * وقت الإنشاء منسق - ✅ آمن
 */
orderSchema.virtual("formattedCreatedAt").get(function () {
  if (!this.createdAt) return '';
  return this.createdAt.toLocaleString('ar-SA');
});

/**
 * وقت التوصيل منسق - ✅ آمن
 */
orderSchema.virtual("formattedDeliveredAt").get(function () {
  if (!this.deliveredAt) return '';
  return this.deliveredAt.toLocaleString('ar-SA');
});

// ========== Methods ==========

/**
 * تحديث حالة الطلب
 */
orderSchema.methods.updateStatus = async function (newStatus, userId) {
  const oldStatus = this.status;
  this.status = newStatus;

  if (newStatus === "cancelled") {
    this.cancelledAt = new Date();
    this.cancelledBy = userId;
  }

  if (newStatus === "delivered") {
    this.deliveredAt = new Date();
    if (this.createdAt) {
      this.deliveryTime = Math.round((this.deliveredAt - this.createdAt) / 60000);
    }
  }

  await this.save();
  return { oldStatus, newStatus };
};

/**
 * إضافة ملاحظة
 */
orderSchema.methods.addNote = async function (note, addedBy) {
  if (!this.notes) {
    this.notes = note;
  } else {
    this.notes += `\n[${new Date().toLocaleString()}]: ${note}`;
  }
  await this.save();
  return this;
};

/**
 * حساب إجمالي السعر من العناصر (دالة مساعدة)
 */
orderSchema.methods.calculateTotalPrice = function () {
  if (!this.items || !Array.isArray(this.items) || this.items.length === 0) {
    return 0;
  }
  return this.items.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 0)), 0);
};

module.exports = mongoose.model("Order", orderSchema);