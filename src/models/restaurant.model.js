const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema(
  {
    image: {
      type: String,
    },
    coverImage: {
      type: String,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    isOpen: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    averageRating: {
      type: Number,
      default: 0,
    },
    ratingsCount: {
      type: Number,
      default: 0,
    },
    type: {
      type: String,
      default: "restaurant",
      enum: ["restaurant", "cafe", "bakery", "fast-food", "grocery", "pharmacy", "other"],
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    openingHours: {
      type: Map,
      of: String, // يوم: ساعات مثل "09:00-22:00"
      default: {},
    },
    deliveryFee: {
      type: Number,
      default: 0,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
    },
    estimatedDeliveryTime: {
      type: Number, // بالدقائق
      default: 30,
    },
    tags: [{
      type: String,
      trim: true,
    }],
  },
  { timestamps: true }
);

restaurantSchema.virtual("items", {
  ref: "Item",
  localField: "_id",
  foreignField: "restaurant",
});

restaurantSchema.virtual("addresses", {
  ref: "RestaurantAddress",
  localField: "_id",
  foreignField: "restaurant",
});

restaurantSchema.virtual("reviews", {
  ref: "Review",
  localField: "_id",
  foreignField: "restaurant",
});

restaurantSchema.set("toObject", { virtuals: true });
restaurantSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Restaurant", restaurantSchema);