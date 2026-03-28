// ============================================
// ملف: src/controllers/address.controller.js
// الوصف: إدارة عناوين المستخدمين
// الإصدار: 2.0 (محدث)
// ============================================

const { Address } = require('../models');
const cache = require("../utils/cache.util");
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة ==========

/**
 * إبطال كاش العناوين
 */
const invalidateAddressCache = (userId) => {
  cache.del(`addresses:user:${userId}`);
  cache.del(`user:complete:${userId}`);
  cache.del(`dashboard:${userId}`);
};

// ========== 2. دوال عامة ==========

/**
 * @desc    إضافة عنوان جديد
 * @route   POST /api/addresses
 * @access  Authenticated
 */
exports.createAddress = async (req, res) => {
  try {
    const { label, addressLine, city, latitude, longitude, isDefault } = req.body;

    // التحقق من البيانات المطلوبة
    if (!label || !addressLine) {
      return res.status(400).json({
        success: false,
        message: "Label and address line are required"
      });
    }

    // التحقق من صحة التسمية
    const validLabels = ['home', 'work', 'office', 'other'];
    if (!validLabels.includes(label)) {
      return res.status(400).json({
        success: false,
        message: `Label must be one of: ${validLabels.join(', ')}`
      });
    }

    // إنشاء العنوان
    const address = await Address.create({
      user: req.user.id,
      label,
      addressLine: addressLine.trim(),
      city: city?.trim() || "Niamey",
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      isDefault: isDefault || false
    });

    // إذا كان العنوان افتراضي، نلغي الافتراضية من البقية
    if (address.isDefault) {
      await Address.updateMany(
        { user: req.user.id, _id: { $ne: address._id } },
        { isDefault: false }
      );
    }

    // إبطال الكاش
    invalidateAddressCache(req.user.id);

    res.status(201).json({
      success: true,
      message: "Address created successfully",
      data: address
    });
  } catch (error) {
    console.error('❌ Create address error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({ 
      success: false,
      message: "Failed to create address" 
    });
  }
};

/**
 * @desc    جلب عناوين المستخدم الحالي
 * @route   GET /api/addresses/me
 * @access  Authenticated
 */
exports.getMyAddresses = async (req, res) => {
  try {
    const userId = req.user.id;

    const cacheKey = `addresses:user:${userId}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log(`📍 Serving addresses from cache for user ${userId}`);
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const addresses = await Address.find({ user: userId })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();

    cache.set(cacheKey, addresses, 300); // 5 دقائق

    res.json({
      success: true,
      data: addresses
    });
  } catch (error) {
    console.error('❌ Get addresses error:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch addresses" 
    });
  }
};

/**
 * @desc    تحديث عنوان
 * @route   PUT /api/addresses/:id
 * @access  Authenticated
 */
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, addressLine, city, latitude, longitude, isDefault } = req.body;

    // التحقق من وجود العنوان
    const address = await Address.findOne({
      _id: id,
      user: req.user.id
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    // تحديث الحقول
    if (label) {
      const validLabels = ['home', 'work', 'office', 'other'];
      if (!validLabels.includes(label)) {
        return res.status(400).json({
          success: false,
          message: `Label must be one of: ${validLabels.join(', ')}`
        });
      }
      address.label = label;
    }
    
    if (addressLine) address.addressLine = addressLine.trim();
    if (city) address.city = city.trim();
    if (latitude) address.latitude = parseFloat(latitude);
    if (longitude) address.longitude = parseFloat(longitude);
    
    if (isDefault !== undefined) {
      address.isDefault = isDefault;
    }

    await address.save();

    // إذا كان العنوان افتراضي، نلغي الافتراضية من البقية
    if (address.isDefault) {
      await Address.updateMany(
        { user: req.user.id, _id: { $ne: address._id } },
        { isDefault: false }
      );
    }

    // إبطال الكاش
    invalidateAddressCache(req.user.id);

    res.json({
      success: true,
      message: "Address updated successfully",
      data: address
    });
  } catch (error) {
    console.error('❌ Update address error:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to update address" 
    });
  }
};

/**
 * @desc    حذف عنوان
 * @route   DELETE /api/addresses/:id
 * @access  Authenticated
 */
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await Address.findOneAndDelete({
      _id: id,
      user: req.user.id
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    // إذا كان العنوان المحذوف افتراضي، نجعل أول عنوان افتراضي
    if (address.isDefault) {
      const firstAddress = await Address.findOne({ user: req.user.id });
      if (firstAddress) {
        firstAddress.isDefault = true;
        await firstAddress.save();
      }
    }

    // إبطال الكاش
    invalidateAddressCache(req.user.id);

    res.json({ 
      success: true,
      message: "Address deleted successfully" 
    });
  } catch (error) {
    console.error('❌ Delete address error:', error);
    res.status(500).json({ 
      success: false,
      message: "Failed to delete address" 
    });
  }
};

/**
 * @desc    تعيين عنوان كافتراضي
 * @route   PUT /api/addresses/:id/set-default
 * @access  Authenticated
 */
exports.setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;

    // التحقق من وجود العنوان
    const address = await Address.findOne({
      _id: id,
      user: req.user.id
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    // إلغاء الافتراضية من جميع العناوين
    await Address.updateMany(
      { user: req.user.id },
      { isDefault: false }
    );

    // تعيين هذا العنوان كافتراضي
    address.isDefault = true;
    await address.save();

    // إبطال الكاش
    invalidateAddressCache(req.user.id);

    res.json({
      success: true,
      message: "Default address updated successfully",
      data: address
    });
  } catch (error) {
    console.error('❌ Set default address error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to set default address"
    });
  }
};

/**
 * @desc    الحصول على عنوان محدد
 * @route   GET /api/addresses/:id
 * @access  Authenticated
 */
exports.getAddressById = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await Address.findOne({
      _id: id,
      user: req.user.id
    }).lean();

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
    console.error('❌ Get address error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid address ID"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to fetch address"
    });
  }
};

module.exports = exports;