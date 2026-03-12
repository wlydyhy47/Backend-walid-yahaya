// ============================================
// ملف: src/controllers/restaurantAddress.controller.js (محدث)
// الوصف: إدارة عناوين المطاعم
// ============================================

const RestaurantAddress = require("../models/restaurantAddress.model");
const Restaurant = require("../models/restaurant.model");
const cache = require("../utils/cache.util");
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== دوال مساعدة ==========

/**
 * إبطال كاش العناوين
 */
const invalidateAddressCache = (restaurantId) => {
  cache.del(`restaurant:full:${restaurantId}`);
  cache.invalidatePattern(`restaurants:*`);
};

// ========== دوال العناوين ==========

/**
 * @desc    إنشاء عنوان مطعم
 * @route   POST /api/restaurants/addresses
 * @access  Admin
 */
exports.createAddress = async (req, res) => {
  try {
    const { restaurantId, addressLine, city, latitude, longitude } = req.body;

    // تحقق أن المطعم موجود
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ 
        success: false,
        message: "Restaurant not found" 
      });
    }

    const address = await RestaurantAddress.create({
      restaurant: restaurantId,
      addressLine,
      city: city || "Niamey",
      latitude,
      longitude
    });

    // إبطال الكاش
    invalidateAddressCache(restaurantId);

    res.status(201).json({
      success: true,
      message: "Address created successfully",
      data: address
    });
  } catch (error) {
    console.error("❌ Error in createAddress:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to create restaurant address" 
    });
  }
};

/**
 * @desc    جلب عناوين مطعم
 * @route   GET /api/restaurants/:restaurantId/addresses
 * @access  Public
 */
exports.getAddresses = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const addresses = await RestaurantAddress.find({
      restaurant: restaurantId
    }).lean();

    res.json({
      success: true,
      data: addresses
    });
  } catch (error) {
    console.error("❌ Error in getAddresses:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch restaurant addresses" 
    });
  }
};

/**
 * @desc    تحديث عنوان مطعم
 * @route   PUT /api/restaurants/addresses/:id
 * @access  Admin
 */
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { addressLine, city, latitude, longitude } = req.body;

    const address = await RestaurantAddress.findById(id);
    
    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    // تحديث الحقول
    if (addressLine) address.addressLine = addressLine;
    if (city) address.city = city;
    if (latitude !== undefined) address.latitude = latitude;
    if (longitude !== undefined) address.longitude = longitude;

    await address.save();

    // إبطال الكاش
    invalidateAddressCache(address.restaurant);

    res.json({
      success: true,
      message: "Address updated successfully",
      data: address
    });
  } catch (error) {
    console.error("❌ Error in updateAddress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update address"
    });
  }
};

/**
 * @desc    حذف عنوان مطعم
 * @route   DELETE /api/restaurants/addresses/:id
 * @access  Admin
 */
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await RestaurantAddress.findById(id);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    const restaurantId = address.restaurant;
    await address.deleteOne();

    // إبطال الكاش
    invalidateAddressCache(restaurantId);

    res.json({
      success: true,
      message: "Address deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error in deleteAddress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete address"
    });
  }
};

/**
 * @desc    الحصول على عنوان محدد
 * @route   GET /api/restaurants/addresses/:id
 * @access  Public
 */
exports.getAddressById = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await RestaurantAddress.findById(id)
      .populate('restaurant', 'name image')
      .lean();

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    res.json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error("❌ Error in getAddressById:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch address"
    });
  }
};