const mongoose = require("mongoose");

const restaurantAddressSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },

    addressLine: {
      type: String,
      required: true,
    },

    city: {
      type: String,
      default: "Niamey",
    },

    latitude: Number,
    longitude: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model("RestaurantAddress", restaurantAddressSchema);
