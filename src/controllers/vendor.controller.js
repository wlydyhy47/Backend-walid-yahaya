// ============================================
// ملف: src/controllers/vendor.controller.js (مصحح)
// الوصف: التحكم في عمليات التجار (أصحاب المتاجر)
// الإصدار: 2.0
// ============================================

const Store = require("../models/store.model");
const StoreAddress = require("../models/storeAddress.model");
const Product = require("../models/product.model");
const User = require("../models/user.model");
const Order = require("../models/order.model");
const Review = require("../models/review.model");
const cache = require("../utils/cache.util");
const fileService = require('../services/file.service');
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة ==========

/**
 * إبطال كاش التاجر
 */
const invalidateVendorCache = (storeId, userId) => {
  cache.del(`vendor:profile:${userId}`);
  cache.del(`vendor:dashboard:${storeId}`);
  cache.del(`vendor:stats:${storeId}`);
  cache.invalidatePattern(`vendor:orders:${storeId}:*`);
  cache.del(`store:complete:${storeId}`);
  cache.invalidatePattern('stores:*');
};

/**
 * التحقق من ملكية المتجر
 */
const checkStoreOwnership = async (storeId, userId) => {
  const store = await Store.findById(storeId);
  if (!store) {
    throw new AppError('المتجر غير موجود', 404);
  }

  // المشرف يمكنه الوصول لأي متجر
  if (req.user?.role === 'admin') return { store };

  if (!store.owner || store.owner.toString() !== userId) {
    throw new AppError('غير مصرح لك بالوصول إلى هذا المتجر', 403);
  }

  return { store };
};

// ========== 2. الملف الشخصي ==========

/**
 * @desc    الحصول على ملف التاجر الشخصي
 * @route   GET /api/v1/vendor/profile
 * @access  Vendor
 */
exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const cacheKey = `vendor:profile:${userId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const user = await User.findById(userId)
      .select('name phone email image coverImage storeOwnerInfo')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    // إحصائيات سريعة
    let storeStats = {};
    if (user.storeOwnerInfo?.store) {
      const storeId = user.storeOwnerInfo.store;
      
      const [todayOrders, totalRevenue, pendingOrders] = await Promise.all([
        Order.countDocuments({
          store: storeId,
          status: 'delivered',
          createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
        }),
        
        Order.aggregate([
          { $match: { store: storeId, status: 'delivered' } },
          { $group: { _id: null, total: { $sum: '$totalPrice' } } }
        ]),

        Order.countDocuments({
          store: storeId,
          status: 'pending'
        })
      ]);

      storeStats = {
        storeId,
        todayOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        pendingOrders
      };
    }

    const profileData = {
      ...user,
      storeStats
    };

    cache.set(cacheKey, profileData, 300); // 5 دقائق

    res.json({
      success: true,
      data: profileData
    });
  } catch (error) {
    console.error("❌ Get vendor profile error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب ملف التاجر"
    });
  }
};

/**
 * @desc    تحديث ملف التاجر
 * @route   PUT /api/v1/vendor/profile
 * @access  Vendor
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, bio, phone } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (bio) updateData.bio = bio;
    if (phone) updateData.phone = phone;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('name phone email image bio');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    // إبطال الكاش
    cache.del(`vendor:profile:${userId}`);

    res.json({
      success: true,
      message: "تم تحديث الملف الشخصي بنجاح",
      data: user
    });
  } catch (error) {
    console.error("❌ Update vendor profile error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث الملف الشخصي"
    });
  }
};

/**
 * @desc    تحديث الصورة الشخصية
 * @route   PUT /api/v1/vendor/profile/avatar
 * @access  Vendor
 */
exports.updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "لم يتم رفع أي صورة"
      });
    }

    const userId = req.user.id;

    const oldUser = await User.findById(userId).select('image');
    if (oldUser?.image) {
      const oldPublicId = fileService.extractPublicIdFromUrl(oldUser.image);
      if (oldPublicId) {
        fileService.deleteFile(oldPublicId).catch(err =>
          console.error('Error deleting old avatar:', err)
        );
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { image: req.file.path },
      { new: true }
    ).select('name email image');

    // إبطال الكاش
    cache.del(`vendor:profile:${userId}`);

    res.json({
      success: true,
      message: "تم تحديث الصورة الشخصية بنجاح",
      data: {
        image: user.image,
        optimized: req.file.thumbnail || null
      }
    });
  } catch (error) {
    console.error("❌ Update avatar error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث الصورة الشخصية"
    });
  }
};

// ========== 3. إدارة المتجر ==========

/**
 * @desc    الحصول على المتجر الخاص بالتاجر
 * @route   GET /api/v1/vendor/store
 * @access  Vendor
 */
exports.getMyStore = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const cacheKey = `vendor:store:${storeId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const store = await Store.findById(storeId)
      .populate('addresses')
      .populate({
        path: 'products',
        select: 'name price image category inventory isAvailable',
        options: { limit: 10 }
      })
      .lean();

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "المتجر غير موجود"
      });
    }

    // إحصائيات سريعة
    const [productsCount, ordersCount, reviewsCount] = await Promise.all([
      Product.countDocuments({ store: storeId }),
      Order.countDocuments({ store: storeId }),
      Review.countDocuments({ store: storeId })
    ]);

    const storeData = {
      ...store,
      stats: {
        productsCount,
        ordersCount,
        reviewsCount,
        averageRating: store.averageRating || 0
      }
    };

    cache.set(cacheKey, storeData, 300); // 5 دقائق

    res.json({
      success: true,
      data: storeData
    });
  } catch (error) {
    console.error("❌ Get store error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب بيانات المتجر"
    });
  }
};

/**
 * @desc    تحديث المتجر
 * @route   PUT /api/v1/vendor/store
 * @access  Vendor
 */
exports.updateStore = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;
    const updates = req.body;

    // الحقول المسموح بتحديثها
    const allowedUpdates = [
      'name', 'description', 'category', 'phone', 'email', 'website',
      'address', 'deliveryInfo', 'tags', 'openingHours', 'isOpen'
    ];

    const updateData = {};
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        if (key === 'tags' && typeof updates[key] === 'string') {
          updateData[key] = updates[key].split(',').map(tag => tag.trim()).filter(tag => tag);
        } else if (key === 'address' && typeof updates[key] === 'string') {
          try {
            updateData[key] = JSON.parse(updates[key]);
          } catch (e) {
            updateData[key] = updates[key];
          }
        } else if (key === 'deliveryInfo' && typeof updates[key] === 'string') {
          try {
            updateData[key] = JSON.parse(updates[key]);
          } catch (e) {
            updateData[key] = updates[key];
          }
        } else {
          updateData[key] = updates[key];
        }
      }
    });

    const store = await Store.findByIdAndUpdate(
      storeId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "المتجر غير موجود"
      });
    }

    // إبطال الكاش
    invalidateVendorCache(storeId, userId);

    res.json({
      success: true,
      message: "تم تحديث المتجر بنجاح",
      data: store,
      updatedFields: Object.keys(updateData)
    });
  } catch (error) {
    console.error("❌ Update store error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث المتجر"
    });
  }
};

/**
 * @desc    تحديث شعار المتجر
 * @route   PUT /api/v1/vendor/store/logo
 * @access  Vendor
 */
exports.updateStoreLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "لم يتم رفع أي صورة"
      });
    }

    const userId = req.user.id;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const oldStore = await Store.findById(storeId).select('logo');
    if (oldStore?.logo) {
      const oldPublicId = fileService.extractPublicIdFromUrl(oldStore.logo);
      if (oldPublicId) {
        fileService.deleteFile(oldPublicId).catch(err =>
          console.error('Error deleting old logo:', err)
        );
      }
    }

    const store = await Store.findByIdAndUpdate(
      storeId,
      { logo: req.file.path },
      { new: true }
    );

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "المتجر غير موجود"
      });
    }

    // إبطال الكاش
    invalidateVendorCache(storeId, userId);

    res.json({
      success: true,
      message: "تم تحديث شعار المتجر بنجاح",
      data: {
        logo: store.logo,
        optimized: req.file.thumbnail || null
      }
    });
  } catch (error) {
    console.error("❌ Update store logo error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث شعار المتجر"
    });
  }
};

/**
 * @desc    تحديث صورة الغلاف
 * @route   PUT /api/v1/vendor/store/cover
 * @access  Vendor
 */
exports.updateStoreCover = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "لم يتم رفع أي صورة"
      });
    }

    const userId = req.user.id;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const oldStore = await Store.findById(storeId).select('coverImage');
    if (oldStore?.coverImage) {
      const oldPublicId = fileService.extractPublicIdFromUrl(oldStore.coverImage);
      if (oldPublicId) {
        fileService.deleteFile(oldPublicId).catch(err =>
          console.error('Error deleting old cover:', err)
        );
      }
    }

    const store = await Store.findByIdAndUpdate(
      storeId,
      { coverImage: req.file.path },
      { new: true }
    );

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "المتجر غير موجود"
      });
    }

    // إبطال الكاش
    invalidateVendorCache(storeId, userId);

    res.json({
      success: true,
      message: "تم تحديث صورة الغلاف بنجاح",
      data: {
        coverImage: store.coverImage,
        optimized: req.file.thumbnail || null
      }
    });
  } catch (error) {
    console.error("❌ Update store cover error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث صورة الغلاف"
    });
  }
};

/**
 * @desc    تبديل حالة المتجر (مفتوح/مغلق)
 * @route   PUT /api/v1/vendor/store/toggle-status
 * @access  Vendor
 */
exports.toggleStoreStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const store = await Store.findById(storeId);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "المتجر غير موجود"
      });
    }

    store.isOpen = !store.isOpen;
    await store.save();

    // تحديث معلومات المستخدم
    await User.findByIdAndUpdate(userId, {
      "storeOwnerInfo.isStoreOpen": store.isOpen
    });

    // إبطال الكاش
    invalidateVendorCache(storeId, userId);

    res.json({
      success: true,
      message: store.isOpen ? "المتجر الآن مفتوح" : "المتجر الآن مغلق",
      data: {
        isOpen: store.isOpen,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error("❌ Toggle store status error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تغيير حالة المتجر"
    });
  }
};

// ========== 4. عناوين المتجر ==========

/**
 * @desc    الحصول على عناوين المتجر
 * @route   GET /api/v1/vendor/store/addresses
 * @access  Vendor
 */
exports.getAddresses = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const addresses = await StoreAddress.find({
      store: storeId,
      isActive: true
    }).lean();

    res.json({
      success: true,
      data: addresses
    });
  } catch (error) {
    console.error("❌ Get addresses error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب العناوين"
    });
  }
};

/**
 * @desc    إنشاء عنوان جديد للمتجر
 * @route   POST /api/v1/vendor/store/addresses
 * @access  Vendor
 */
exports.createAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { label, addressLine, city, latitude, longitude, phone } = req.body;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const address = await StoreAddress.create({
      store: storeId,
      label: label || "Main Branch",
      addressLine,
      city: city || "Niamey",
      latitude,
      longitude,
      phone,
      isActive: true
    });

    // إبطال الكاش
    invalidateVendorCache(storeId, userId);

    res.status(201).json({
      success: true,
      message: "تم إنشاء العنوان بنجاح",
      data: address
    });
  } catch (error) {
    console.error("❌ Create address error:", error);
    res.status(500).json({
      success: false,
      message: "فشل إنشاء العنوان"
    });
  }
};

/**
 * @desc    تحديث عنوان
 * @route   PUT /api/v1/vendor/store/addresses/:id
 * @access  Vendor
 */
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { label, addressLine, city, latitude, longitude, phone, isActive } = req.body;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const address = await StoreAddress.findOne({
      _id: id,
      store: storeId
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "العنوان غير موجود"
      });
    }

    if (label) address.label = label;
    if (addressLine) address.addressLine = addressLine;
    if (city) address.city = city;
    if (latitude !== undefined) address.latitude = latitude;
    if (longitude !== undefined) address.longitude = longitude;
    if (phone) address.phone = phone;
    if (isActive !== undefined) address.isActive = isActive;

    await address.save();

    // إبطال الكاش
    invalidateVendorCache(storeId, userId);

    res.json({
      success: true,
      message: "تم تحديث العنوان بنجاح",
      data: address
    });
  } catch (error) {
    console.error("❌ Update address error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث العنوان"
    });
  }
};

/**
 * @desc    حذف عنوان
 * @route   DELETE /api/v1/vendor/store/addresses/:id
 * @access  Vendor
 */
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const address = await StoreAddress.findOneAndDelete({
      _id: id,
      store: storeId
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "العنوان غير موجود"
      });
    }

    // إبطال الكاش
    invalidateVendorCache(storeId, userId);

    res.json({
      success: true,
      message: "تم حذف العنوان بنجاح"
    });
  } catch (error) {
    console.error("❌ Delete address error:", error);
    res.status(500).json({
      success: false,
      message: "فشل حذف العنوان"
    });
  }
};

/**
 * @desc    الحصول على عنوان محدد
 * @route   GET /api/v1/vendor/store/addresses/:id
 * @access  Vendor
 */
exports.getAddressById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const address = await StoreAddress.findOne({
      _id: id,
      store: storeId
    }).lean();

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "العنوان غير موجود"
      });
    }

    res.json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error("❌ Get address error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب العنوان"
    });
  }
};

// ========== 5. التحليلات ==========

/**
 * @desc    الحصول على تحليلات المتجر
 * @route   GET /api/v1/vendor/analytics
 * @access  Vendor
 */
exports.getAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const cacheKey = `vendor:analytics:${storeId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        cached: true
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [
      todayStats,
      weeklyStats,
      monthlyStats,
      topProducts,
      orderStatusStats
    ] = await Promise.all([
      // إحصائيات اليوم
      Order.aggregate([
        {
          $match: {
            store: storeId,
            createdAt: { $gte: today }
          }
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: '$totalPrice' },
            avgOrderValue: { $avg: '$totalPrice' }
          }
        }
      ]),

      // إحصائيات الأسبوع
      Order.aggregate([
        {
          $match: {
            store: storeId,
            createdAt: { $gte: weekAgo }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            orders: { $sum: 1 },
            revenue: { $sum: '$totalPrice' }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // إحصائيات الشهر
      Order.aggregate([
        {
          $match: {
            store: storeId,
            createdAt: { $gte: monthAgo }
          }
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: '$totalPrice' },
            avgOrderValue: { $avg: '$totalPrice' }
          }
        }
      ]),

      // أفضل المنتجات
      Order.aggregate([
        { $match: { store: storeId, status: 'delivered' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.name',
            quantity: { $sum: '$items.qty' },
            revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } }
          }
        },
        { $sort: { quantity: -1 } },
        { $limit: 5 }
      ]),

      // الطلبات حسب الحالة
      Order.aggregate([
        { $match: { store: storeId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const analyticsData = {
      today: todayStats[0] || { orders: 0, revenue: 0, avgOrderValue: 0 },
      weekly: {
        labels: weeklyStats.map(day => day._id),
        orders: weeklyStats.map(day => day.orders),
        revenue: weeklyStats.map(day => day.revenue)
      },
      monthly: monthlyStats[0] || { orders: 0, revenue: 0, avgOrderValue: 0 },
      topProducts,
      orderStatus: orderStatusStats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      timestamp: new Date()
    };

    cache.set(cacheKey, analyticsData, 600); // 10 دقائق

    res.json({
      success: true,
      data: analyticsData
    });
  } catch (error) {
    console.error("❌ Get analytics error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب التحليلات"
    });
  }
};

/**
 * @desc    الحصول على تقرير مالي
 * @route   GET /api/v1/vendor/analytics/financial
 * @access  Vendor
 */
exports.getFinancialReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = 'month' } = req.query;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    let startDate = new Date();
    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const report = await Order.aggregate([
      {
        $match: {
          store: storeId,
          createdAt: { $gte: startDate },
          status: { $in: ['delivered', 'accepted'] }
        }
      },
      {
        $facet: {
          daily: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                orders: { $sum: 1 },
                revenue: { $sum: '$totalPrice' }
              }
            },
            { $sort: { _id: 1 } }
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: '$totalPrice' },
                avgOrderValue: { $avg: '$totalPrice' },
                minOrder: { $min: '$totalPrice' },
                maxOrder: { $max: '$totalPrice' }
              }
            }
          ]
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period,
        dateRange: {
          from: startDate,
          to: new Date()
        },
        summary: report[0]?.summary[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
        daily: report[0]?.daily || []
      }
    });
  } catch (error) {
    console.error("❌ Get financial report error:", error);
    res.status(500).json({
      success: false,
      message: "فشل إنشاء التقرير المالي"
    });
  }
};

/**
 * @desc    الحصول على تقرير الأداء
 * @route   GET /api/v1/vendor/analytics/performance
 * @access  Vendor
 */
exports.getPerformanceReport = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const report = await Order.aggregate([
      { $match: { store: storeId } },
      {
        $facet: {
          completionRate: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                completed: {
                  $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
                },
                cancelled: {
                  $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                }
              }
            },
            {
              $project: {
                completionRate: { $multiply: [{ $divide: ['$completed', '$total'] }, 100] },
                cancellationRate: { $multiply: [{ $divide: ['$cancelled', '$total'] }, 100] }
              }
            }
          ],
          avgDeliveryTime: [
            {
              $match: { status: 'delivered', deliveryTime: { $exists: true } }
            },
            {
              $group: {
                _id: null,
                avgTime: { $avg: '$deliveryTime' }
              }
            }
          ],
          customerSatisfaction: [
            {
              $lookup: {
                from: 'reviews',
                localField: '_id',
                foreignField: 'order',
                as: 'review'
              }
            },
            { $unwind: '$review' },
            {
              $group: {
                _id: null,
                avgRating: { $avg: '$review.rating' },
                totalReviews: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        completionRate: report[0]?.completionRate[0] || { completionRate: 0, cancellationRate: 0 },
        avgDeliveryTime: report[0]?.avgDeliveryTime[0]?.avgTime || 0,
        customerSatisfaction: report[0]?.customerSatisfaction[0] || { avgRating: 0, totalReviews: 0 }
      }
    });
  } catch (error) {
    console.error("❌ Get performance report error:", error);
    res.status(500).json({
      success: false,
      message: "فشل إنشاء تقرير الأداء"
    });
  }
};

/**
 * @desc    الحصول على تحليلات المنتجات
 * @route   GET /api/v1/vendor/analytics/products
 * @access  Vendor
 */
exports.getProductAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const analytics = await Product.aggregate([
      { $match: { store: storeId } },
      {
        $facet: {
          byCategory: [
            { $group: { _id: '$category', count: { $sum: 1 } } }
          ],
          availability: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                available: { $sum: { $cond: [{ $eq: ['$isAvailable', true] }, 1, 0] } },
                outOfStock: { $sum: { $cond: [{ $lte: ['$inventory.quantity', 0] }, 1, 0] } }
              }
            }
          ],
          priceRange: [
            {
              $group: {
                _id: null,
                minPrice: { $min: '$price' },
                maxPrice: { $max: '$price' },
                avgPrice: { $avg: '$price' }
              }
            }
          ]
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        byCategory: analytics[0]?.byCategory || [],
        availability: analytics[0]?.availability[0] || { total: 0, available: 0, outOfStock: 0 },
        priceRange: analytics[0]?.priceRange[0] || { minPrice: 0, maxPrice: 0, avgPrice: 0 }
      }
    });
  } catch (error) {
    console.error("❌ Get product analytics error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب تحليلات المنتجات"
    });
  }
};

// ========== 6. دوال للمشرفين ==========

/**
 * @desc    الحصول على جميع التجار (للمشرفين)
 * @route   GET /api/v1/admin/vendors
 * @access  Admin
 */
exports.getVendors = async (req, res) => {
  try {
    const vendors = await User.find({ 
      role: 'restaurant_owner',
      isActive: true 
    })
      .select('name phone email image storeOwnerInfo createdAt')
      .populate('storeOwnerInfo.store', 'name logo category isOpen averageRating')
      .lean();

    res.json({
      success: true,
      data: vendors
    });
  } catch (error) {
    console.error("❌ Get vendors error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب التجار"
    });
  }
};

/**
 * @desc    الحصول على تاجر محدد (للمشرفين)
 * @route   GET /api/v1/admin/vendors/:id
 * @access  Admin
 */
exports.getVendorById = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await User.findById(id)
      .select('-password -verificationCode -resetPasswordToken -activityLog')
      .populate('storeOwnerInfo.store')
      .lean();

    if (!vendor || vendor.role !== 'restaurant_owner') {
      return res.status(404).json({
        success: false,
        message: "التاجر غير موجود"
      });
    }

    res.json({
      success: true,
      data: vendor
    });
  } catch (error) {
    console.error("❌ Get vendor by id error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب بيانات التاجر"
    });
  }
};

/**
 * @desc    توثيق تاجر (للمشرفين)
 * @route   PUT /api/v1/admin/vendors/:id/verify
 * @access  Admin
 */
exports.verifyVendor = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await User.findByIdAndUpdate(
      id,
      { isVerified: true },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "التاجر غير موجود"
      });
    }

    res.json({
      success: true,
      message: "تم توثيق التاجر بنجاح",
      data: { isVerified: vendor.isVerified }
    });
  } catch (error) {
    console.error("❌ Verify vendor error:", error);
    res.status(500).json({
      success: false,
      message: "فشل توثيق التاجر"
    });
  }
};

/**
 * @desc    تغيير حالة المتجر (للمشرفين)
 * @route   PUT /api/v1/admin/vendors/:id/status
 * @access  Admin
 */
exports.toggleVendorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    // التحقق من وجود البيانات
    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: "حقل isActive مطلوب"
      });
    }
    
    const vendor = await User.findById(id);
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "التاجر غير موجود"
      });
    }
    
    vendor.isActive = isActive;
    await vendor.save();
    
    // إذا كان للتاجر متجر، تحديث حالة المتجر أيضاً
    if (vendor.storeOwnerInfo?.store) {
      await Store.findByIdAndUpdate(vendor.storeOwnerInfo.store, {
        isOpen: isActive
      });
    }
    
    res.json({
      success: true,
      message: `تم ${isActive ? 'تفعيل' : 'تعطيل'} التاجر بنجاح`,
      data: { 
        id: vendor._id,
        isActive: vendor.isActive 
      }
    });
  } catch (error) {
    console.error("❌ Toggle vendor status error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تغيير حالة التاجر"
    });
  }
};


/**
 * @desc    الحصول على جميع التجار (للمشرفين)
 */
exports.getVendors = async (req, res) => {
  try {
    const User = require('../models/user.model');
    const vendors = await User.find({ role: 'store_owner' })
      .select('name phone email image storeOwnerInfo createdAt')
      .lean();
    
    res.json({
      success: true,
      data: vendors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    الحصول على تاجر محدد
 */
exports.getVendorById = async (req, res) => {
  try {
    const User = require('../models/user.model');
    const vendor = await User.findById(req.params.id)
      .select('-password -verificationCode -resetPasswordToken')
      .lean();
    
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'التاجر غير موجود' });
    }
    
    res.json({
      success: true,
      data: vendor
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    توثيق تاجر
 */
exports.verifyVendor = async (req, res) => {
  try {
    const User = require('../models/user.model');
    const vendor = await User.findByIdAndUpdate(
      req.params.id,
      { isVerified: true },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'تم توثيق التاجر بنجاح',
      data: { isVerified: vendor.isVerified }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


module.exports = exports;