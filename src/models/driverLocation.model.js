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
        type: [Number], // [lng, lat]
        required: true,
      },
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 60 * 10, // 🧹 يحذف بعد 10 دقائق
    },
  }
);

// Geo index
driverLocationSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("DriverLocation", driverLocationSchema);
