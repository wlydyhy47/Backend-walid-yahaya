// ============================================
// ملف: src/models/driverLocation.model.js (محدث)
// الوصف: تتبع مواقع المندوبين
// ============================================

const mongoose = require("mongoose");

const driverLocationSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: function(coords) {
            return coords.length === 2 && 
                   coords[0] >= -180 && coords[0] <= 180 &&
                   coords[1] >= -90 && coords[1] <= 90;
          },
          message: 'Invalid coordinates'
        }
      },
    },
    
    // ========== 🔥 إضافات جديدة ==========
    
    /**
     * سرعة المندوب (كم/ساعة)
     */
    speed: {
      type: Number,
      min: 0,
    },
    
    /**
     * اتجاه الحركة (بالدرجات)
     */
    heading: {
      type: Number,
      min: 0,
      max: 360,
    },
    
    /**
     * دقة الموقع (بالأمتار)
     */
    accuracy: {
      type: Number,
      min: 0,
    },
    
    /**
     * مصدر الموقع
     */
    provider: {
      type: String,
      enum: ["gps", "network", "passive"],
      default: "gps",
    },
    
    /**
     * معلومات إضافية
     */
    metadata: {
      batteryLevel: Number,
      isCharging: Boolean,
      networkType: String,
    },
    
    // ========== نهاية الإضافات ==========
    
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 60 * 10, // يحذف بعد 10 دقائق
      index: true,
    },
  }
);

// ========== Indexes ==========
driverLocationSchema.index({ location: "2dsphere" });
driverLocationSchema.index({ driver: 1, createdAt: -1 });
driverLocationSchema.index({ order: 1, createdAt: -1 });

// ========== Virtuals ==========

/**
 * تنسيق الموقع كـ {lat, lng}
 */
driverLocationSchema.virtual("latLng").get(function () {
  return {
    lat: this.location.coordinates[1],
    lng: this.location.coordinates[0]
  };
});

// ========== Static Methods ==========

/**
 * البحث عن أقرب المندوبين
 */
driverLocationSchema.statics.findNearby = async function(lat, lng, maxDistance = 5000, limit = 10) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [lng, lat]
        },
        $maxDistance: maxDistance
      }
    }
  })
  .populate('driver', 'name phone rating driverInfo.isAvailable')
  .limit(limit)
  .lean();
};

/**
 * الحصول على آخر موقع لمندوب
 */
driverLocationSchema.statics.getLatestLocation = async function(driverId) {
  return this.findOne({ driver: driverId })
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * الحصول على مسار المندوب لطلب معين
 */
driverLocationSchema.statics.getPathForOrder = async function(orderId, driverId) {
  return this.find({
    order: orderId,
    driver: driverId,
    createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // آخر ساعة
  })
  .sort({ createdAt: 1 })
  .lean();
};

module.exports = mongoose.model("DriverLocation", driverLocationSchema);