// ============================================
// ملف: src/models/storeAddress.model.js (محدث)
// الوصف: عناوين المتاجر المتعددة
// ============================================

const mongoose = require("mongoose");

const storeAddressSchema = new mongoose.Schema(
  {
    store: {  // 🔄 كان restaurant
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },

    label: {  // تسمية العنوان (مثلاً: "الفرع الرئيسي", "فرع السوق")
      type: String,
      default: "Main Branch",
    },

    addressLine: {
      type: String,
      required: true,
    },

    city: {
      type: String,
      default: "Niamey",
    },

    state: String,
    
    country: {
      type: String,
      default: "Niger",
    },

    postalCode: String,

    latitude: Number,
    longitude: Number,

    phone: String, // هاتف خاص بهذا الفرع

    isDefault: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Indexes
storeAddressSchema.index({ store: 1, isDefault: -1 });
storeAddressSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("StoreAddress", storeAddressSchema);