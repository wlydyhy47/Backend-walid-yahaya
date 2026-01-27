const mongoose = require("mongoose");
const { populate } = require("./order.model");

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
    type: {     // ✅ النوع العام للمطعم
      type: String, 
      default: "restaurant" // يمكن أن يكون: restaurant, bakery, cafe, fast-food, grocery, pharmacy ...
    },

  },
  { timestamps: true }
);

restaurantSchema.virtual("items", {
  ref: "Item",
  localField: "_id",
  foreignField: "restaurant"
});
restaurantSchema.set("toObject", { virtuals: true });
restaurantSchema.set("toJSON", { virtuals: true });


module.exports = mongoose.model("Restaurant", restaurantSchema);
