const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
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
    image: {
      type: String,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      default: "main",
      enum: ["appetizer", "main", "dessert", "drink", "side", "special"],
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    ingredients: [{
      type: String,
      trim: true,
    }],
    preparationTime: {
      type: Number, // بالدقائق
      default: 15,
    },
    spicyLevel: {
      type: Number,
      min: 0,
      max: 3,
      default: 0,
    },
    isVegetarian: {
      type: Boolean,
      default: false,
    },
    isVegan: {
      type: Boolean,
      default: false,
    },
    calories: {
      type: Number,
      min: 0,
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// إنشاء index للبحث السريع
itemSchema.index({ name: "text", description: "text", category: 1 });
itemSchema.index({ restaurant: 1, category: 1 });
itemSchema.index({ restaurant: 1, isAvailable: 1 });

module.exports = mongoose.model("Item", itemSchema);