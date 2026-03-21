// ============================================
// ملف: src/controllers/user.controller.js
// الوصف: التحكم الكامل في عمليات المستخدمين
// الإصدار: 3.0 (موحد - بدون تكرار)
// ============================================

const User = require("../models/user.model");
const Order = require("../models/order.model");
const Address = require("../models/address.model");
const Review = require("../models/review.model");
const Store = require("../models/store.model");
const Favorite = require("../models/favorite.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const cache = require("../utils/cache.util");
const fileService = require('../services/file.service');
const PaginationUtils = require('../utils/pagination.util');
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال المسؤول (Admin) ==========

/**
 * @desc    الحصول على جميع المستخدمين (مع Pagination)
 * @route   GET /api/users
 * @access  Admin
 */
exports.getUsers = async (req, res) => {
  try {
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, search, filters } = paginationOptions;

    let query = {};

    // بحث نصي
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // فلاتر
    if (filters.role) query.role = filters.role;
    if (filters.isActive !== undefined) query.isActive = filters.isActive === 'true';
    if (filters.isVerified !== undefined) query.isVerified = filters.isVerified === 'true';

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password -verificationCode -resetPasswordToken -activityLog")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments(query)
    ]);

    // إحصائيات سريعة
    const stats = {
      total: await User.countDocuments(),
      active: await User.countDocuments({ isActive: true }),
      verified: await User.countDocuments({ isVerified: true }),
      byRole: await User.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } }
      ])
    };

    const response = PaginationUtils.createPaginationResponse(
      users,
      total,
      paginationOptions,
      { stats }
    );

    res.json(response);
  } catch (error) {
    console.error("❌ Error in getUsers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users"
    });
  }
};

/**
 * @desc    الحصول على مستخدم محدد (للأدمن)
 * @route   GET /api/admin/users/:id
 * @access  Admin
 */
exports.getUserById = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId)
      .select('-password -verificationCode -resetPasswordToken')
      .populate('favorites', 'name image')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // جلب بيانات إضافية
    const [orders, addresses, reviews] = await Promise.all([
      Order.find({ user: userId })
        .populate('store', 'name')
        .populate('driver', 'name')
        .sort({ createdAt: -1 })
        .limit(10),

      Address.find({ user: userId }),

      Review.find({ user: userId })
        .populate('store', 'name image')
        .sort({ createdAt: -1 })
        .limit(10)
    ]);

    res.json({
      success: true,
      data: {
        user,
        orders,
        addresses,
        reviews,
        summary: {
          totalOrders: orders.length,
          totalAddresses: addresses.length,
          totalReviews: reviews.length
        }
      }
    });
  } catch (error) {
    console.error('❌ Error in getUserById:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
};

/**
 * @desc    إنشاء مستخدم جديد (للمسؤول)
 * @route   POST /api/users
 * @access  Admin
 */
exports.createUser = async (req, res) => {
  try {
    const { name, phone, password, email, role = "client" } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, phone and password are required"
      });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      phone,
      email,
      password: hashedPassword,
      role,
      isVerified: true,
      isActive: true
    });

    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.verificationCode;
    delete userResponse.resetPasswordToken;

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: userResponse
    });

  } catch (error) {
    console.error("❌ Error in createUser:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create user"
    });
  }
};

/**
 * @desc    تحديث مستخدم (للأدمن)
 * @route   PUT /api/admin/users/:id
 * @access  Admin
 */
exports.updateUserById = async (req, res) => {
  try {
    const { name, email, role, isActive, isVerified } = req.body;
    const userId = req.params.id;

    const user = await User.findByIdAndUpdate(
      userId,
      { name, email, role, isActive, isVerified },
      { new: true, runValidators: true }
    ).select('-password -verificationCode -resetPasswordToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    cache.del(`user:complete:${userId}`);
    cache.invalidatePattern(`user:*:${userId}`);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    console.error('❌ Error in updateUserById:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
};

/**
 * @desc    حذف/تعطيل مستخدم (للأدمن)
 * @route   DELETE /api/admin/users/:id
 * @access  Admin
 */
exports.deleteUserById = async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    cache.del(`user:complete:${req.params.id}`);
    cache.invalidatePattern(`user:*:${req.params.id}`);

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    console.error('❌ Error in deleteUserById:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

// ========== 2. دوال المستخدم الحالي ==========

/**
 * @desc    جلب بيانات المستخدم الحالي
 * @route   GET /api/users/me
 * @access  Authenticated
 */
exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId)
      .select("-password -verificationCode -resetPasswordToken")
      .populate('favorites', 'name image type averageRating')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    let profileData = { ...user };
    if (user.image) {
      const publicId = fileService.extractPublicIdFromUrl(user.image);
      if (publicId) {
        profileData.optimizedImages = fileService.getAllSizes(publicId);
      }
    }

    const [ordersCount, unreadNotifications] = await Promise.all([
      Order.countDocuments({ user: userId }),
      require("../models/notification.model").countDocuments({
        user: userId,
        status: 'unread'
      })
    ]);

    profileData.quickStats = {
      ordersCount,
      unreadNotifications,
      favoritesCount: user.favorites?.length || 0
    };

    res.json({
      success: true,
      data: profileData
    });
  } catch (error) {
    console.error("❌ Error in getMyProfile:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/**
 * @desc    تحديث الملف الشخصي للمستخدم الحالي
 * @route   PUT /api/users/me
 * @access  Authenticated
 */
exports.updateMyProfile = async (req, res) => {
  try {
    const { name, email, bio, city, dateOfBirth, gender } = req.body;
    const userId = req.user.id;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (bio) updateData.bio = bio;
    if (city) updateData.city = city;
    if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
    if (gender) updateData.gender = gender;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password -verificationCode -resetPasswordToken -activityLog");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    cache.del(`user:complete:${userId}`);
    cache.del(`dashboard:${userId}`);

    await user.logActivity("profile_updated", {
      fields: Object.keys(updateData)
    }, req);

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: user,
      updatedFields: Object.keys(updateData)
    });
  } catch (error) {
    console.error("❌ Error in updateMyProfile:", error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update profile"
    });
  }
};

/**
 * @desc    جلب الملف الشخصي الكامل (مع كل التفاصيل)
 * @route   GET /api/users/me/complete
 * @access  Authenticated
 */
exports.getMyCompleteProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `user:complete:${userId}`;

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log(`📦 Serving complete profile from cache for user ${userId}`);
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    console.log(`🔄 Fetching complete profile for user ${userId}`);

    const [
      user,
      addresses,
      recentOrders,
      favoriteStores,
      recentReviews,
      stats
    ] = await Promise.all([
      User.findById(userId)
        .select("-password -verificationCode -resetPasswordToken -activityLog")
        .lean(),

      Address.find({ user: userId })
        .sort({ isDefault: -1, createdAt: -1 })
        .lean(),

      Order.find({ user: userId })
        .populate("store", "name image")
        .populate("driver", "name phone image")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      Store.find({ _id: { $in: user?.favorites || [] } })
        .select("name image type averageRating")
        .limit(10)
        .lean(),

      Review.find({ user: userId })
        .populate("store", "name image")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      exports.getUserAdvancedStats(userId)
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (user.image) {
      const publicId = fileService.extractPublicIdFromUrl(user.image);
      if (publicId) {
        user.optimizedImages = fileService.getAllSizes(publicId);
      }
    }

    const responseData = {
      success: true,
      data: {
        user,
        addresses,
        recentOrders,
        favoriteStores,
        recentReviews,
        stats,
        summary: {
          addressesCount: addresses.length,
          totalOrders: user.stats?.totalOrders || 0,
          favoriteStoresCount: favoriteStores.length,
          reviewsCount: recentReviews.length,
          unreadNotifications: await require("../models/notification.model").countDocuments({
            user: userId,
            status: 'unread'
          })
        }
      },
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 300);

    res.json(responseData);
  } catch (error) {
    console.error("❌ Complete profile error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to load profile data"
    });
  }
};

/**
 * @desc    تحديث الملف الشخصي الكامل
 * @route   PUT /api/users/me/complete
 * @access  Authenticated
 */
exports.updateCompleteProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updateData = req.body;

    console.log(`🔄 Updating complete profile for user ${userId}`);

    const allowedFields = [
      "name", "email", "bio", "city",
      "dateOfBirth", "gender", "preferences"
    ];

    const filteredData = {};
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredData[key] = updateData[key];
      }
    });

    if (updateData.latitude && updateData.longitude) {
      filteredData.location = {
        type: "Point",
        coordinates: [
          parseFloat(updateData.longitude),
          parseFloat(updateData.latitude)
        ]
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: filteredData },
      {
        new: true,
        runValidators: true,
        select: "-password -verificationCode -resetPasswordToken -activityLog"
      }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    cache.del(`user:complete:${userId}`);
    cache.invalidatePattern(`user:*:${userId}`);

    await updatedUser.logActivity("profile_updated", {
      fields: Object.keys(filteredData)
    }, req);

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
      updatedFields: Object.keys(filteredData),
      timestamp: new Date()
    });
  } catch (error) {
    console.error("❌ Complete profile update error:", error.message);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update profile"
    });
  }
};

// ========== 3. دوال الصور ==========

/**
 * @desc    رفع صورة شخصية
 * @route   PUT /api/users/me/avatar
 * @access  Authenticated
 */
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }

    fileService.validateFile(req.file, 'avatar');

    const oldUser = await User.findById(req.user.id).select('image metadata.avatar.publicId');
    let oldPublicId = null;

    if (oldUser && oldUser.image) {
      oldPublicId = oldUser.metadata?.avatar?.publicId ||
        fileService.extractPublicIdFromUrl(oldUser.image);
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        image: req.file.path,
        'metadata.avatar': {
          publicId: req.file.publicId,
          uploadedAt: new Date(),
          thumbnail: req.file.thumbnail
        }
      },
      { new: true }
    ).select("name email phone role image");

    if (oldPublicId) {
      fileService.deleteFile(oldPublicId).catch(err =>
        console.error('Error deleting old avatar:', err)
      );
    }

    const optimizedImages = req.file.allSizes || fileService.getAllSizes(req.file.publicId);

    cache.del(`user:complete:${req.user.id}`);

    res.json({
      success: true,
      message: "Avatar uploaded successfully",
      data: {
        user,
        image: {
          url: req.file.path,
          thumbnail: req.file.thumbnail,
          allSizes: optimizedImages
        }
      }
    });

  } catch (error) {
    console.error("❌ Error in uploadAvatar:", error);

    if (error.isOperational) {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to upload avatar"
    });
  }
};

/**
 * @desc    حذف الصورة الشخصية
 * @route   DELETE /api/users/me/avatar
 * @access  Authenticated
 */
exports.deleteAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('image metadata.avatar.publicId');

    if (!user || !user.image) {
      return res.status(404).json({
        success: false,
        message: "No avatar found"
      });
    }

    const publicId = user.metadata?.avatar?.publicId ||
      fileService.extractPublicIdFromUrl(user.image);

    if (publicId) {
      await fileService.deleteFile(publicId);
    }

    user.image = null;
    user.metadata = { ...user.metadata, avatar: undefined };
    await user.save();

    cache.del(`user:complete:${req.user.id}`);

    res.json({
      success: true,
      message: "Avatar deleted successfully"
    });

  } catch (error) {
    console.error("❌ Error in deleteAvatar:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete avatar"
    });
  }
};

/**
 * @desc    تحديث صورة الغلاف
 * @route   PUT /api/users/me/cover
 * @access  Authenticated
 */
exports.updateCoverImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded"
      });
    }

    const userId = req.user.id;
    const imageUrl = req.file.path;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { coverImage: imageUrl },
      {
        new: true,
        select: "-password -verificationCode -resetPasswordToken"
      }
    );

    cache.del(`user:complete:${userId}`);

    res.json({
      success: true,
      message: "Cover image updated successfully",
      data: {
        coverImage: updatedUser.coverImage
      }
    });

  } catch (error) {
    console.error("❌ Cover image error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update cover image"
    });
  }
};

// ========== 4. دوال المفضلة (دمج favorite.controller.js) ==========

/**
 * @desc    الحصول على مفضلات المستخدم
 * @route   GET /api/users/me/favorites
 * @access  Authenticated
 */
exports.getMyFavorites = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, sort = "-createdAt" } = req.query;

    const result = await Favorite.getUserFavorites(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("❌ Error in getMyFavorites:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch favorites"
    });
  }
};

/**
 * @desc    إضافة للمفضلة
 * @route   POST /api/users/me/favorites/:storeId
 * @access  Authenticated
 */
exports.addToFavorites = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { notes, tags } = req.body;

    const favorite = await Favorite.addToFavorites(
      req.user.id,
      storeId,
      notes,
      tags || []
    );

    cache.del(`user:complete:${req.user.id}`);

    res.status(201).json({
      success: true,
      message: "Added to favorites successfully",
      data: favorite
    });
  } catch (error) {
    console.error("❌ Error in addToFavorites:", error);

    if (error.message === "Store already in favorites") {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to add to favorites"
    });
  }
};

/**
 * @desc    إزالة من المفضلة
 * @route   DELETE /api/users/me/favorites/:storeId
 * @access  Authenticated
 */
exports.removeFromFavorites = async (req, res) => {
  try {
    const { storeId } = req.params;

    await Favorite.removeFromFavorites(req.user.id, storeId);

    cache.del(`user:complete:${req.user.id}`);

    res.json({
      success: true,
      message: "Removed from favorites successfully"
    });
  } catch (error) {
    console.error("❌ Error in removeFromFavorites:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove from favorites"
    });
  }
};

/**
 * @desc    التحقق من حالة المفضلة
 * @route   GET /api/users/me/favorites/:storeId/status
 * @access  Authenticated
 */
exports.checkFavoriteStatus = async (req, res) => {
  try {
    const { storeId } = req.params;

    const isFavorite = await Favorite.isFavorite(req.user.id, storeId);

    res.json({
      success: true,
      data: {
        isFavorite,
        storeId
      }
    });
  } catch (error) {
    console.error("❌ Error in checkFavoriteStatus:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check favorite status"
    });
  }
};

/**
 * @desc    تحديث المفضلة
 * @route   PUT /api/users/me/favorites/:storeId
 * @access  Authenticated
 */
exports.updateFavorite = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { notes, tags, isActive } = req.body;

    const favorite = await Favorite.findOneAndUpdate(
      { user: req.user.id, store: storeId },
      { notes, tags, isActive },
      { new: true, runValidators: true }
    );

    if (!favorite) {
      return res.status(404).json({
        success: false,
        message: "Favorite not found"
      });
    }

    cache.del(`user:complete:${req.user.id}`);

    res.json({
      success: true,
      message: "Favorite updated successfully",
      data: favorite
    });
  } catch (error) {
    console.error("❌ Error in updateFavorite:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update favorite"
    });
  }
};

// ========== 5. دوال الأمان ==========

/**
 * @desc    تغيير كلمة المرور
 * @route   PUT /api/users/me/password
 * @access  Authenticated
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All password fields are required"
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New passwords do not match"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    const user = await User.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    cache.invalidatePattern(`session:*:${userId}`);

    await user.logActivity("password_changed", {}, req);

    res.json({
      success: true,
      message: "Password changed successfully",
      timestamp: new Date()
    });
  } catch (error) {
    console.error("❌ Password change error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to change password"
    });
  }
};

// ========== 6. دوال الإحصائيات والنشاطات ==========

/**
 * @desc    الحصول على إحصائيات المستخدم
 * @route   GET /api/users/me/stats
 * @access  Authenticated
 */
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `user:stats:${userId}`;

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true
      });
    }

    const stats = await exports.getUserAdvancedStats(userId);

    const responseData = {
      success: true,
      data: stats,
      cached: false,
      timestamp: new Date()
    };

    cache.set(cacheKey, responseData, 300);

    res.json(responseData);
  } catch (error) {
    console.error("❌ User stats error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get user statistics"
    });
  }
};

/**
 * @desc    الحصول على سجل النشاطات
 * @route   GET /api/users/me/activity
 * @access  Authenticated
 */
exports.getActivityLog = async (req, res) => {
  try {
    const userId = req.user.id;
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit } = paginationOptions;

    const user = await User.findById(userId).select("activityLog");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const total = user.activityLog.length;
    const activityLog = user.activityLog
      .slice(skip, skip + limit)
      .map(log => ({
        ...log,
        relativeTime: exports.getRelativeTime(log.timestamp)
      }));

    const response = PaginationUtils.createPaginationResponse(
      activityLog,
      total,
      paginationOptions,
      {
        summary: {
          totalActivities: total,
          lastActivity: user.activityLog[0]?.timestamp || null
        }
      }
    );

    res.json(response);
  } catch (error) {
    console.error("❌ Activity log error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get activity log"
    });
  }
};

/**
 * @desc    تحديث حالة التواجد
 * @route   PUT /api/users/me/presence
 * @access  Authenticated
 */
exports.updatePresence = async (req, res) => {
  try {
    const userId = req.user.id;
    const { isOnline, location } = req.body;

    const updateData = { isOnline };

    if (location && location.latitude && location.longitude) {
      updateData.location = {
        type: "Point",
        coordinates: [location.longitude, location.latitude]
      };

      if (req.user.role === "driver") {
        updateData["driverInfo.currentLocation"] = updateData.location;
        updateData["driverInfo.isAvailable"] = isOnline;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, select: "name role isOnline location" }
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('user:presence', {
        userId,
        isOnline: updatedUser.isOnline,
        location: updatedUser.location,
        role: updatedUser.role,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: `You are now ${isOnline ? 'online' : 'offline'}`,
      data: {
        isOnline: updatedUser.isOnline,
        location: updatedUser.location
      }
    });
  } catch (error) {
    console.error("❌ Presence update error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update presence"
    });
  }
};

// ========== 7. دوال مساعدة (Helpers) ==========

/**
 * الحصول على إحصائيات المستخدم المتقدمة
 */
exports.getUserAdvancedStats = async (userId) => {
  try {
    const [orderStats, reviewStats, spendingStats, categoryStats] = await Promise.all([
      Order.aggregate([
        { $match: { user: userId } },
        {
          $facet: {
            byStatus: [
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 },
                  totalAmount: { $sum: "$totalPrice" }
                }
              }
            ],
            total: [
              {
                $group: {
                  _id: null,
                  totalOrders: { $sum: 1 },
                  totalSpent: { $sum: "$totalPrice" },
                  avgOrderValue: { $avg: "$totalPrice" }
                }
              }
            ]
          }
        }
      ]),

      Review.aggregate([
        { $match: { user: userId } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 }
          }
        }
      ]),

      Order.aggregate([
        {
          $match: {
            user: userId,
            status: "delivered"
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m", date: "$createdAt" }
            },
            totalSpent: { $sum: "$totalPrice" },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 6 }
      ]),

      Order.aggregate([
        { $match: { user: userId, status: "delivered" } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.category",
            count: { $sum: 1 },
            totalSpent: { $sum: "$items.price" }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ]);

    const orderStatusStats = {};
    let totalOrders = 0;
    let totalSpent = 0;

    if (orderStats[0]?.byStatus) {
      orderStats[0].byStatus.forEach(stat => {
        orderStatusStats[stat._id] = {
          count: stat.count,
          amount: stat.totalAmount
        };
        totalOrders += stat.count;
        totalSpent += stat.totalAmount;
      });
    }

    const totals = orderStats[0]?.total[0] || { totalOrders: 0, totalSpent: 0, avgOrderValue: 0 };

    const reviewData = reviewStats[0] || {
      averageRating: 0,
      totalReviews: 0
    };

    return {
      orders: {
        total: totals.totalOrders,
        totalSpent: totals.totalSpent,
        averageValue: totals.avgOrderValue,
        byStatus: orderStatusStats,
        monthlySpending: spendingStats,
        favoriteCategories: categoryStats
      },
      reviews: {
        averageRating: reviewData.averageRating || 0,
        total: reviewData.totalReviews || 0
      },
      memberSince: await exports.getMemberSince(userId),
      lastActive: await exports.getLastActivity(userId)
    };
  } catch (error) {
    console.error("❌ Stats calculation error:", error);
    return {
      orders: { total: 0, totalSpent: 0, byStatus: {} },
      reviews: { averageRating: 0, total: 0 }
    };
  }
};

/**
 * الحصول على تاريخ الانضمام
 */
exports.getMemberSince = async (userId) => {
  try {
    const user = await User.findById(userId).select("createdAt");
    return {
      date: user?.createdAt,
      relativeTime: exports.getRelativeTime(user?.createdAt)
    };
  } catch (error) {
    return null;
  }
};

/**
 * الحصول على آخر نشاط
 */
exports.getLastActivity = async (userId) => {
  try {
    const user = await User.findById(userId).select("lastActivity lastLogin");

    const activities = [
      { type: "lastLogin", date: user?.lastLogin },
      { type: "lastActivity", date: user?.lastActivity }
    ].filter(activity => activity.date);

    if (activities.length === 0) return null;

    const latestActivity = activities.reduce((latest, current) => {
      return new Date(current.date) > new Date(latest.date) ? current : latest;
    });

    return {
      type: latestActivity.type,
      date: latestActivity.date,
      relativeTime: exports.getRelativeTime(latestActivity.date)
    };
  } catch (error) {
    return null;
  }
};

/**
 * تحويل التاريخ إلى وقت نسبي
 */
exports.getRelativeTime = (date) => {
  if (!date) return null;

  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `منذ ${diffDays} يوم`;
  if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسبوع`;
  if (diffDays < 365) return `منذ ${Math.floor(diffDays / 30)} شهر`;
  return `منذ ${Math.floor(diffDays / 365)} سنة`;
};

/**
 * @desc    الحصول على إحصائيات الفئات المفضلة
 * @access  Internal
 */
exports.getFavoriteCategories = async (userId) => {
  try {
    const favoriteCategories = await Order.aggregate([
      { $match: { user: userId, status: "delivered" } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "items",
          localField: "items.item",
          foreignField: "_id",
          as: "itemDetails",
        },
      },
      { $unwind: "$itemDetails" },
      {
        $group: {
          _id: "$itemDetails.category",
          count: { $sum: 1 },
          totalSpent: { $sum: "$items.price" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    return favoriteCategories.map(cat => ({
      category: cat._id || "unknown",
      orderCount: cat.count,
      totalSpent: cat.totalSpent,
    }));
  } catch (error) {
    console.error("Favorite categories error:", error);
    return [];
  }
};

/**
 * @desc    حساب المتوسط الشهري للإنفاق
 * @access  Internal
 */
exports.calculateMonthlyAverage = async (userId) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const result = await Order.aggregate([
      {
        $match: {
          user: userId,
          status: "delivered",
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          totalSpent: { $sum: "$totalPrice" },
          orderCount: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          averageMonthlySpent: { $avg: "$totalSpent" },
          averageMonthlyOrders: { $avg: "$orderCount" },
        },
      },
    ]);

    return result[0] || { averageMonthlySpent: 0, averageMonthlyOrders: 0 };
  } catch (error) {
    console.error("Monthly average error:", error);
    return { averageMonthlySpent: 0, averageMonthlyOrders: 0 };
  }
};

/**
 * @desc    الوقت المفضل للطلب
 * @access  Internal
 */
exports.getFavoriteTimeOfDay = async (userId) => {
  try {
    const result = await Order.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]);

    if (result.length === 0) return null;

    const hour = result[0]._id;
    let timeOfDay = "";

    if (hour < 6) timeOfDay = "ليل";
    else if (hour < 12) timeOfDay = "صباح";
    else if (hour < 18) timeOfDay = "ظهر";
    else timeOfDay = "مساء";

    return {
      hour,
      timeOfDay,
      count: result[0].count,
    };
  } catch (error) {
    console.error("Favorite time error:", error);
    return null;
  }
};

/**
 * @desc    اليوم المفضل للطلب
 * @access  Internal
 */
exports.getFavoriteDayOfWeek = async (userId) => {
  try {
    const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

    const result = await Order.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: { $dayOfWeek: "$createdAt" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]);

    if (result.length === 0) return null;

    const dayIndex = result[0]._id - 1;
    return {
      dayIndex,
      dayName: days[dayIndex],
      count: result[0].count,
    };
  } catch (error) {
    console.error("Favorite day error:", error);
    return null;
  }
};

/**
 * @desc    متوسط سرعة التوصيل
 * @access  Internal
 */
exports.getAverageDeliverySpeed = async (userId) => {
  try {
    const result = await Order.aggregate([
      {
        $match: {
          user: userId,
          status: "delivered",
          createdAt: { $exists: true },
          updatedAt: { $exists: true },
        },
      },
      {
        $project: {
          deliveryTime: {
            $divide: [
              { $subtract: ["$updatedAt", "$createdAt"] },
              60000,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          averageDeliveryTime: { $avg: "$deliveryTime" },
          fastestDelivery: { $min: "$deliveryTime" },
          slowestDelivery: { $max: "$deliveryTime" },
        },
      },
    ]);

    return result[0] || {
      averageDeliveryTime: 0,
      fastestDelivery: 0,
      slowestDelivery: 0,
    };
  } catch (error) {
    console.error("Delivery speed error:", error);
    return {
      averageDeliveryTime: 0,
      fastestDelivery: 0,
      slowestDelivery: 0,
    };
  }
};

// ========== 8. دوال مستخدم واحد (للأدمن) - معاد توجيهها للدوال الأساسية ==========

/**
 * @desc    الحصول على مستخدم محدد (للأدمن) - معاد توجيهها لـ getUserById
 * @route   GET /api/users/:id
 * @access  Admin
 */
exports.getUser = exports.getUserById;

/**
 * @desc    تحديث مستخدم (للأدمن) - معاد توجيهها لـ updateUserById
 * @route   PUT /api/users/:id
 * @access  Admin
 */
exports.updateUser = exports.updateUserById;

/**
 * @desc    حذف/تعطيل مستخدم (للأدمن) - معاد توجيهها لـ deleteUserById
 * @route   DELETE /api/users/:id
 * @access  Admin
 */
exports.deleteUser = exports.deleteUserById;

/**
 * @desc    الحصول على جميع المستخدمين (للأدمن) - معاد توجيهها لـ getUsers
 * @route   GET /api/admin/users
 * @access  Admin
 */
exports.getAllUsers = exports.getUsers;

module.exports = exports;