// ============================================
// ملف: src/models/product.model.js (محدث)
// الوصف: نموذج المنتج (لجميع أنواع المتاجر)
// ============================================

const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    discountedPrice: {  // سعر بعد الخصم
      type: Number,
      min: 0,
    },

    image: {
      type: String,
    },

    gallery: [String], // معرض صور المنتج

    description: {
      type: String,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      // enum: [
      //   // للمطاعم
      //   "appetizer", "main", "dessert", "drink", "side", "special",
      //   // للبقالة
      //   "fruits", "vegetables", "dairy", "meat", "bakery", "beverages", "snacks",
      //   // للصيدليات
      //   "medicines", "supplements", "personal-care", "baby-care",
      //   // عام
      //   "electronics", "clothing", "books", "other"
      // ],
    },

    store: {  // 🔄 كان store
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },

    // معلومات المخزون
    inventory: {
      quantity: { type: Number, default: 0 },
      unit: { type: String, default: "piece" }, // piece, kg, liter, etc.
      lowStockThreshold: { type: Number, default: 5 },
      trackInventory: { type: Boolean, default: false },
    },

    isAvailable: {
      type: Boolean,
      default: true,
    },

    // للمنتجات الغذائية
    ingredients: [{
      type: String,
      trim: true,
    }],

    nutritionalInfo: {
      calories: Number,
      protein: Number,
      carbs: Number,
      fat: Number,
      allergens: [String],
    },

    preparationTime: {
      type: Number, // بالدقائق
      default: 15,
    },

    // خصائص إضافية
    attributes: {
      spicyLevel: { type: Number, min: 0, max: 3, default: 0 },
      isVegetarian: { type: Boolean, default: false },
      isVegan: { type: Boolean, default: false },
      isGlutenFree: { type: Boolean, default: false },
      isOrganic: { type: Boolean, default: false },
    },

    // خيارات إضافية (للبيتزا مثلاً)
    options: [{
      name: String,
      choices: [{
        name: String,
        price: Number,
      }],
      required: Boolean,
      multiple: Boolean,
    }],

    tags: [String],

    // إحصائيات المنتج
    stats: {
      views: { type: Number, default: 0 },
      orders: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
productSchema.index({ name: "text", description: "text" });
productSchema.index({ store: 1, category: 1 });
productSchema.index({ store: 1, isAvailable: 1 });
productSchema.index({ 'inventory.quantity': 1 });

module.exports = mongoose.model("Product", productSchema);