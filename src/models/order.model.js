// ============================================
// ملف: src/models/order.model.js (محدث)
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
          ref: "Item",
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
    
    // ========== 🔥 إضافات جديدة ==========
    
    /**
     * المسافة المقدرة للتوصيل
     */
    estimatedDistance: {
      type: Number, // بالأمتار
      min: 0,
    },
    
    /**
     * وقت التوصيل المقدر
     */
    estimatedDeliveryTime: {
      type: Number, // بالدقائق
      default: 30,
    },
    
    /**
     * وقت التحضير المقدر
     */
    estimatedPreparationTime: {
      type: Number, // بالدقائق
      default: 15,
    },
    
    /**
     * وقت التوصيل الفعلي
     */
    deliveryTime: {
      type: Number, // بالدقائق
    },
    
    /**
     * ملاحظات الطلب
     */
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    
    /**
     * سبب الإلغاء
     */
    cancellationReason: {
      type: String,
      trim: true,
    },
    
    /**
     * من قام بالإلغاء
     */
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    /**
     * وقت الإلغاء
     */
    cancelledAt: Date,
    
    /**
     * وقت التوصيل
     */
    deliveredAt: Date,
    
    // ========== نهاية الإضافات ==========
    
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
      enum: ["pending", "accepted", "picked", "delivered", "cancelled"],
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

// ========== Virtuals ==========

/**
 * إجمالي عدد العناصر
 */
orderSchema.virtual("totalItems").get(function () {
  return this.items.reduce((sum, item) => sum + item.qty, 0);
});

/**
 * هل يمكن إلغاء الطلب
 */
orderSchema.virtual("canCancel").get(function () {
  return ["pending", "accepted"].includes(this.status);
});

/**
 * هل يمكن تحديث الحالة
 */
orderSchema.virtual("canUpdateStatus").get(function () {
  return this.status !== "cancelled" && this.status !== "delivered";
});

/**
 * وقت الطلب منذ إنشائه
 */
orderSchema.virtual("timeSinceCreation").get(function () {
  const now = new Date();
  const diffMs = now - this.createdAt;
  return Math.round(diffMs / 60000); // بالدقائق
});

// ========== Middleware ==========

/**
 * قبل الحفظ
 */
orderSchema.pre("save", function(next) {
  // حساب إجمالي السعر من العناصر إذا لم يكن موجوداً
  if (!this.totalPrice && this.items.length > 0) {
    this.totalPrice = this.items.reduce((sum, item) => {
      return sum + (item.price * item.qty);
    }, 0);
  }
  
  // تحديث وقت التوصيل عند اكتمال الطلب
  if (this.isModified("status") && this.status === "delivered" && !this.deliveredAt) {
    this.deliveredAt = new Date();
    
    // حساب وقت التوصيل الفعلي
    if (this.createdAt) {
      this.deliveryTime = Math.round((this.deliveredAt - this.createdAt) / 60000);
    }
  }
  
  next();
});

// ========== Methods ==========

/**
 * تحديث حالة الطلب
 */
orderSchema.methods.updateStatus = async function(newStatus, userId) {
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
orderSchema.methods.addNote = async function(note, addedBy) {
  if (!this.notes) {
    this.notes = note;
  } else {
    this.notes += `\n[${new Date().toLocaleString()}]: ${note}`;
  }
  await this.save();
  return this;
};

module.exports = mongoose.model("Order", orderSchema);