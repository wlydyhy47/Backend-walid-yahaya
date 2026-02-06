const User = require("../models/user.model");
const Order = require("../models/order.model");
const Address = require("../models/address.model");
const Review = require("../models/review.model");
const Restaurant = require("../models/restaurant.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const cache = require("../utils/cache.util");
const PaginationUtils = require("../utils/pagination.util");

/**
 * 📋 الحصول على بيانات المستخدم الكاملة
 * GET /api/users/me/complete
 */
exports.getMyCompleteProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `user:complete:${userId}`;
    
    // محاولة جلب البيانات من الكاش
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log("📦 Serving complete profile from cache");
      return res.json({
        ...cachedData,
        cached: true,
      });
    }

    console.log(`🔄 Fetching complete profile for user ${userId}`);
    
    // جلب جميع البيانات بالتوازي
    const [
      user,
      addresses,
      recentOrders,
      favoriteRestaurants,
      recentReviews,
      stats,
    ] = await Promise.all([
      // بيانات المستخدم الأساسية
      User.findById(userId)
        .select("-password -verificationCode -resetPasswordToken -activityLog")
        .lean(),
      
      // عناوين المستخدم
      Address.find({ user: userId })
        .sort({ isDefault: -1, createdAt: -1 })
        .lean(),
      
      // آخر 5 طلبات
      Order.find({ user: userId })
        .populate("restaurant", "name image")
        .populate("driver", "name phone image")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      
      // المطاعم المفضلة
      Restaurant.find({ _id: { $in: user?.favorites || [] } })
        .select("name image type averageRating")
        .limit(10)
        .lean(),
      
      // آخر التقييمات
      Review.find({ user: userId })
        .populate("restaurant", "name image")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      
      // إحصائيات متقدمة
      this.getUserAdvancedStats(userId),
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // حساب العمر
    if (user.dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(user.dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      user.age = age;
    }

    // إعداد الاستجابة
    const responseData = {
      success: true,
      data: {
        user,
        addresses,
        recentOrders,
        favoriteRestaurants,
        recentReviews,
        stats,
        summary: {
          addressesCount: addresses.length,
          totalOrders: user.stats?.totalOrders || 0,
          favoriteRestaurantsCount: favoriteRestaurants.length,
          reviewsCount: recentReviews.length,
        },
      },
      cached: false,
      timestamp: new Date(),
    };

    // حفظ في الكاش لمدة 5 دقائق
    cache.set(cacheKey, responseData, 300);
    
    res.json(responseData);
  } catch (error) {
    console.error("❌ Complete profile error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to load profile data",
    });
  }
};

/**
 * 📊 الحصول على إحصائيات المستخدم المتقدمة
 */
exports.getUserAdvancedStats = async (userId) => {
  try {
    const [orderStats, reviewStats, spendingStats] = await Promise.all([
      // إحصائيات الطلبات
      Order.aggregate([
        { $match: { user: userId } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$totalPrice" },
          },
        },
      ]),
      
      // إحصائيات التقييمات
      Review.aggregate([
        { $match: { user: userId } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ]),
      
      // إحصائيات الإنفاق
      Order.aggregate([
        { $match: { user: userId, status: "delivered" } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m", date: "$createdAt" },
            },
            totalSpent: { $sum: "$totalPrice" },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 6 },
      ]),
    ]);

    // معالجة إحصائيات الطلبات
    const orderStatusStats = {};
    let totalOrders = 0;
    let totalSpent = 0;

    orderStats.forEach(stat => {
      orderStatusStats[stat._id] = {
        count: stat.count,
        amount: stat.totalAmount,
      };
      totalOrders += stat.count;
      totalSpent += stat.totalAmount;
    });

    // معالجة إحصائيات التقييمات
    const reviewData = reviewStats[0] || {
      averageRating: 0,
      totalReviews: 0,
    };

    // معالجة إحصائيات الإنفاق الشهرية
    const monthlySpending = spendingStats.reduce((acc, curr) => {
      acc[curr._id] = {
        spent: curr.totalSpent,
        orders: curr.orderCount,
      };
      return acc;
    }, {});

    return {
      orderStatusStats,
      totalOrders,
      totalSpent,
      averageOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
      reviewStats: {
        averageRating: reviewData.averageRating || 0,
        totalReviews: reviewData.totalReviews || 0,
      },
      monthlySpending,
      favoriteCategories: await this.getFavoriteCategories(userId),
      lastActive: await this.getLastActivity(userId),
    };
  } catch (error) {
    console.error("Stats calculation error:", error);
    return {};
  }
};

/**
 * 📈 الحصول على الفئات المفضلة للمستخدم
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
 * 📍 الحصول على آخر نشاط للمستخدم
 */
exports.getLastActivity = async (userId) => {
  try {
    const user = await User.findById(userId).select("lastActivity lastLogin");
    
    const activities = [
      { type: "lastLogin", date: user?.lastLogin },
      { type: "lastActivity", date: user?.lastActivity },
    ].filter(activity => activity.date);

    if (activities.length === 0) return null;

    const latestActivity = activities.reduce((latest, current) => {
      return new Date(current.date) > new Date(latest.date) ? current : latest;
    });

    return {
      type: latestActivity.type,
      date: latestActivity.date,
      relativeTime: this.getRelativeTime(latestActivity.date),
    };
  } catch (error) {
    console.error("Last activity error:", error);
    return null;
  }
};

/**
 * ⏰ تحويل التاريخ إلى وقت نسبي
 */
exports.getRelativeTime = (date) => {
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
  
  return past.toLocaleDateString("ar-EG");
};

/**
 * 🔄 تحديث الملف الشخصي
 * PUT /api/users/me/complete
 */
exports.updateCompleteProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updateData = req.body;
    
    console.log(`🔄 Updating profile for user ${userId}`);

    // الحقول المسموح بتحديثها
    const allowedFields = [
      "name", "email", "bio", "address", "city", 
      "dateOfBirth", "gender", "preferences"
    ];
    
    // فلترة البيانات
    const filteredData = {};
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredData[key] = updateData[key];
      }
    });

    // تحديث الموقع إذا كان موجوداً
    if (updateData.latitude && updateData.longitude) {
      filteredData.location = {
        type: "Point",
        coordinates: [
          parseFloat(updateData.longitude),
          parseFloat(updateData.latitude),
        ],
      };
    }

    // تحديث المستخدم
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
        message: "User not found",
      });
    }

    // إبطال الكاش
    cache.del(`user:complete:${userId}`);
    cache.invalidatePattern(`user:*:${userId}`);

    // تسجيل النشاط
    await updatedUser.logActivity("profile_updated", {
      fields: Object.keys(filteredData),
      ip: req.ip,
    }, req);

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
      updatedFields: Object.keys(filteredData),
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Profile update error:", error.message);
    
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map(err => err.message),
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email or phone already exists",
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
};

/**
 * 📷 تحديث صورة المستخدم
 * PUT /api/users/me/avatar
 */
exports.updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded",
      });
    }

    const userId = req.user.id;
    const imageUrl = req.file.path; // Cloudinary URL

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { image: imageUrl },
      { 
        new: true,
        select: "-password -verificationCode -resetPasswordToken"
      }
    );

    // إبطال الكاش
    cache.del(`user:complete:${userId}`);

    // تسجيل النشاط
    await updatedUser.logActivity("avatar_updated", {
      imageUrl,
      ip: req.ip,
    }, req);

    res.json({
      success: true,
      message: "Avatar updated successfully",
      data: {
        image: updatedUser.image,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Avatar update error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update avatar",
    });
  }
};

/**
 * 🖼️ تحديث صورة الغلاف
 * PUT /api/users/me/cover
 */
exports.updateCoverImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded",
      });
    }

    const userId = req.user.id;
    const imageUrl = req.file.path;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { coverImage: imageUrl },
      { 
        new: true,
        select: "-password"
      }
    );

    cache.del(`user:complete:${userId}`);

    await updatedUser.logActivity("cover_updated", {
      imageUrl,
      ip: req.ip,
    }, req);

    res.json({
      success: true,
      message: "Cover image updated successfully",
      data: {
        coverImage: updatedUser.coverImage,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Cover image error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update cover image",
    });
  }
};

/**
 * 🔐 تغيير كلمة المرور
 * PUT /api/users/me/password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id;

    // التحقق من البيانات
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All password fields are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New passwords do not match",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // جلب المستخدم مع كلمة المرور
    const user = await User.findById(userId).select("+password");
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // التحقق من كلمة المرور الحالية
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // تحديث كلمة المرور
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // إبطال جميع الجلسات
    cache.invalidatePattern(`session:*:${userId}`);

    // تسجيل النشاط
    await user.logActivity("password_changed", {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    }, req);

    // إنشاء token جديد
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Password changed successfully",
      token, // إرجاع token جديد
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Password change error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to change password",
    });
  }
};

/**
 * ⭐ إضافة/إزالة مطعم من المفضلة
 * POST /api/users/me/favorites/:restaurantId
 */
exports.toggleFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { restaurantId } = req.params;

    const user = await User.findById(userId);
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    const isFavorite = user.favorites.includes(restaurantId);
    let message = "";
    
    if (isFavorite) {
      // إزالة من المفضلة
      user.favorites = user.favorites.filter(
        fav => fav.toString() !== restaurantId
      );
      message = "Restaurant removed from favorites";
    } else {
      // إضافة إلى المفضلة
      user.favorites.push(restaurantId);
      message = "Restaurant added to favorites";
    }

    await user.save();
    cache.del(`user:complete:${userId}`);

    // تسجيل النشاط
    await user.logActivity(
      isFavorite ? "favorite_removed" : "favorite_added",
      { restaurantId, restaurantName: restaurant.name },
      req
    );

    res.json({
      success: true,
      message,
      data: {
        isFavorite: !isFavorite,
        favoritesCount: user.favorites.length,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Toggle favorite error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update favorites",
    });
  }
};

/**
 * 📜 الحصول على سجل النشاطات
 * GET /api/users/me/activity
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
        message: "User not found",
      });
    }

    // تطبيق pagination على سجل النشاطات
    const total = user.activityLog.length;
    const activityLog = user.activityLog
      .slice(skip, skip + limit)
      .map(log => ({
        ...log,
        relativeTime: this.getRelativeTime(log.timestamp),
      }));

    const response = PaginationUtils.createPaginationResponse(
      activityLog,
      total,
      paginationOptions,
      {
        summary: {
          totalActivities: total,
          lastActivity: user.activityLog[0]?.timestamp || null,
        },
      }
    );

    res.json(response);
  } catch (error) {
    console.error("❌ Activity log error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get activity log",
    });
  }
};

/**
 * 📊 الحصول على إحصائيات المستخدم
 * GET /api/users/me/stats
 */
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `user:stats:${userId}`;
    
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true,
      });
    }

    const [basicStats, orderStats, spendingTrends] = await Promise.all([
      // الإحصائيات الأساسية
      User.findById(userId)
        .select("stats role createdAt lastLogin lastActivity")
        .lean(),
      
      // إحصائيات الطلبات المتقدمة
      Order.aggregate([
        { $match: { user: userId } },
        {
          $facet: {
            byStatus: [
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 },
                  totalAmount: { $sum: "$totalPrice" },
                },
              },
            ],
            byMonth: [
              {
                $group: {
                  _id: {
                    $dateToString: { format: "%Y-%m", date: "$createdAt" },
                  },
                  count: { $sum: 1 },
                  amount: { $sum: "$totalPrice" },
                },
              },
              { $sort: { _id: -1 } },
              { $limit: 6 },
            ],
            byRestaurant: [
              {
                $group: {
                  _id: "$restaurant",
                  count: { $sum: 1 },
                  amount: { $sum: "$totalPrice" },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 5 },
            ],
            favoriteItems: [
              { $unwind: "$items" },
              {
                $group: {
                  _id: "$items.name",
                  count: { $sum: "$items.qty" },
                  totalAmount: { $sum: { $multiply: ["$items.price", "$items.qty"] } },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 10 },
            ],
          },
        },
      ]),
      
      // اتجاهات الإنفاق
      Order.aggregate([
        { $match: { user: userId, status: "delivered" } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            totalSpent: { $sum: "$totalPrice" },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 30 },
      ]),
    ]);

    // جلب أسماء المطاعم
    const restaurantIds = orderStats[0]?.byRestaurant?.map(r => r._id) || [];
    const restaurants = await Restaurant.find({ _id: { $in: restaurantIds } })
      .select("name image")
      .lean();

    const restaurantMap = restaurants.reduce((map, rest) => {
      map[rest._id] = rest;
      return map;
    }, {});

    // بناء استجابة الإحصائيات
    const responseData = {
      success: true,
      data: {
        basic: {
          memberSince: basicStats.createdAt,
          lastLogin: basicStats.lastLogin,
          lastActivity: basicStats.lastActivity,
          role: basicStats.role,
          ...basicStats.stats,
        },
        orders: {
          byStatus: orderStats[0]?.byStatus?.reduce((acc, stat) => {
            acc[stat._id] = {
              count: stat.count,
              amount: stat.totalAmount,
            };
            return acc;
          }, {}) || {},
          byMonth: orderStats[0]?.byMonth?.map(month => ({
            month: month._id,
            count: month.count,
            amount: month.amount,
          })) || [],
          byRestaurant: orderStats[0]?.byRestaurant?.map(rest => ({
            restaurant: restaurantMap[rest._id] || { _id: rest._id },
            count: rest.count,
            amount: rest.amount,
          })) || [],
          favoriteItems: orderStats[0]?.favoriteItems || [],
        },
        spending: {
          trends: spendingTrends,
          averageOrderValue: basicStats.stats?.totalOrders > 0 
            ? basicStats.stats.totalSpent / basicStats.stats.totalOrders 
            : 0,
          monthlyAverage: await this.calculateMonthlyAverage(userId),
        },
        insights: {
          favoriteTimeOfDay: await this.getFavoriteTimeOfDay(userId),
          favoriteDayOfWeek: await this.getFavoriteDayOfWeek(userId),
          deliverySpeed: await this.getAverageDeliverySpeed(userId),
          cancellationRate: basicStats.stats?.totalOrders > 0
            ? (basicStats.stats.cancelledOrders / basicStats.stats.totalOrders) * 100
            : 0,
        },
      },
      cached: false,
      timestamp: new Date(),
    };

    // حفظ في الكاش لمدة 10 دقائق
    cache.set(cacheKey, responseData, 600);
    
    res.json(responseData);
  } catch (error) {
    console.error("❌ User stats error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get user statistics",
    });
  }
};

/**
 * 📅 حساب المتوسط الشهري للإنفاق
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
 * 🕒 الوقت المفضل للطلب
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
 * 📅 اليوم المفضل للطلب
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

    const dayIndex = result[0]._id - 1; // MongoDB returns 1-7
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
 * ⏱️ متوسط سرعة التوصيل
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
              60000, // تحويل إلى دقائق
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

/**
 * 🚀 تحديث حالة التواجد (Online/Offline)
 * PUT /api/users/me/presence
 */
exports.updatePresence = async (req, res) => {
  try {
    const userId = req.user.id;
    const { isOnline, location } = req.body;

    const updateData = { isOnline };
    
    if (location && location.latitude && location.longitude) {
      updateData.location = {
        type: "Point",
        coordinates: [location.longitude, location.latitude],
      };
      
      // إذا كان المندوب، تحديث موقعه
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

    // إرسال تحديث عبر Socket.io
    if (req.app.get('io')) {
      req.app.get('io').emit('user:presence', {
        userId,
        isOnline: updatedUser.isOnline,
        location: updatedUser.location,
        role: updatedUser.role,
        timestamp: new Date(),
      });
    }

    res.json({
      success: true,
      message: `You are now ${isOnline ? 'online' : 'offline'}`,
      data: {
        isOnline: updatedUser.isOnline,
        location: updatedUser.location,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ Presence update error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update presence",
    });
  }
};