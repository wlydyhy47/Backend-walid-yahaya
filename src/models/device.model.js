const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    
    deviceToken: {
      type: String,
      required: true,
      index: true,
    },
    
    platform: {
      type: String,
      required: true,
      enum: ["ios", "android", "web"],
    },
    
    deviceId: {
      type: String,
      required: true,
      index: true,
    },
    
    deviceModel: String,
    deviceBrand: String,
    osVersion: String,
    
    appVersion: {
      type: String,
    },
    
    lastActive: {
      type: Date,
      default: Date.now,
    },
    
    isActive: {
      type: Boolean,
      default: true,
    },
    
    preferences: {
      notifications: {
        enabled: { type: Boolean, default: true },
        sound: { type: Boolean, default: true },
        vibration: { type: Boolean, default: true },
        badge: { type: Boolean, default: true },
      },
    },
    
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// منع تسجيل نفس الجهاز لنفس المستخدم أكثر من مرة
deviceSchema.index({ user: 1, deviceId: 1 }, { unique: true });

// Middleware
deviceSchema.pre("save", function(next) {
  if (this.isModified("deviceToken")) {
    this.lastActive = new Date();
  }
  next();
});

// Static Methods
deviceSchema.statics.findActiveDevices = function(userId) {
  return this.find({
    user: userId,
    isActive: true,
    lastActive: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // آخر 30 يوم
  });
};

deviceSchema.statics.deactivateDevice = async function(deviceId, userId) {
  return await this.findOneAndUpdate(
    { _id: deviceId, user: userId },
    { isActive: false },
    { new: true }
  );
};

deviceSchema.statics.deactivateAllDevices = async function(userId) {
  return await this.updateMany(
    { user: userId },
    { isActive: false }
  );
};

module.exports = mongoose.model("Device", deviceSchema);