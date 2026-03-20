// ============================================
// ملف: src/controllers/review.controller.js (مصحح)
// الوصف: إدارة تقييمات المتاجر
// الإصدار: 2.0
// ============================================

const Review = require("../models/review.model");
const Store = require("../models/store.model");
const Order = require("../models/order.model");
const cache = require("../utils/cache.util");
const { AppError } = require('../middlewares/errorHandler.middleware');

// ========== 1. دوال مساعدة ==========

/**
 * إبطال كاش التقييمات
 */
const invalidateReviewCache = (storeId) => {
  cache.del(`store:complete:${storeId}`);
  cache.invalidatePattern(`stores:*`);
  cache.invalidatePattern(`reviews:*:${storeId}`);
};

/**
 * تحديث متوسط تقييم المتجر
 */
const updateStoreRating = async (storeId) => {
  try {
    const stats = await Review.aggregate([
      { $match: { store: storeId } },
      {
        $group: {
          _id: "$store",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
          ratingDistribution: {
            $push: "$rating"
          }
        }
      }
    ]);

    if (stats.length > 0) {
      // حساب توزيع التقييمات
      const distribution = {};
      stats[0].ratingDistribution.forEach(r => {
        distribution[r] = (distribution[r] || 0) + 1;
      });

      await Store.findByIdAndUpdate(storeId, {
        averageRating: stats[0].avgRating,
        ratingsCount: stats[0].count,
        ratingDistribution: distribution
      });
    }

    return stats[0] || null;
  } catch (error) {
    console.error("❌ Update store rating error:", error);
    return null;
  }
};

// ========== 2. دوال التقييمات ==========

/**
 * @desc    إضافة تقييم لمتجر
 * @route   POST /api/v1/client/reviews/:storeId
 * @access  Client
 */
exports.addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const storeId = req.params.storeId;
    const userId = req.user.id;

    // التحقق من صحة التقييم
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "التقييم يجب أن يكون بين 1 و 5"
      });
    }

    if (comment && comment.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "التعليق طويل جداً (الحد الأقصى 1000 حرف)"
      });
    }

    // التحقق من وجود المتجر
    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).json({
        success: false,
        message: "المتجر غير موجود"
      });
    }

    // التحقق من عدم وجود تقييم سابق
    const existingReview = await Review.findOne({
      user: userId,
      store: storeId
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "لقد قمت بتقييم هذا المتجر مسبقاً"
      });
    }

    // التحقق من أن المستخدم طلب من هذا المتجر
    const hasOrdered = await Order.findOne({
      user: userId,
      store: storeId,
      status: 'delivered'
    });

    if (!hasOrdered && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: "يمكنك فقط تقييم المتاجر التي طلبت منها"
      });
    }

    // إنشاء التقييم
    const review = await Review.create({
      user: userId,
      store: storeId,
      rating,
      comment: comment?.trim()
    });

    // تحديث متوسط تقييم المتجر
    await updateStoreRating(storeId);

    // إبطال الكاش
    invalidateReviewCache(storeId);

    // جلب التقييم مع بيانات المستخدم
    const populatedReview = await Review.findById(review._id)
      .populate('user', 'name image')
      .lean();

    res.status(201).json({
      success: true,
      message: "تم إضافة التقييم بنجاح",
      data: populatedReview
    });
  } catch (error) {
    console.error("❌ Add review error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "لقد قمت بتقييم هذا المتجر مسبقاً"
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "بيانات غير صالحة",
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: "فشل إضافة التقييم"
    });
  }
};

/**
 * @desc    الحصول على تقييمات متجر
 * @route   GET /api/v1/public/stores/:storeId/reviews
 * @access  Public
 */
exports.getStoreReviews = async (req, res) => {
  try {
    const storeId = req.params.storeId;
    const { page = 1, limit = 10, sort = "-createdAt" } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total] = await Promise.all([
      Review.find({ store: storeId })
        .populate("user", "name image")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),

      Review.countDocuments({ store: storeId })
    ]);

    // إحصائيات إضافية
    const stats = await Review.aggregate([
      { $match: { store: storeId } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          ratingDistribution: {
            $push: "$rating"
          }
        }
      }
    ]);

    // حساب توزيع التقييمات
    const distribution = {};
    if (stats[0]?.ratingDistribution) {
      stats[0].ratingDistribution.forEach(r => {
        distribution[r] = (distribution[r] || 0) + 1;
      });
    }

    res.json({
      success: true,
      data: reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      stats: {
        averageRating: stats[0]?.averageRating || 0,
        totalReviews: stats[0]?.totalReviews || 0,
        ratingDistribution: distribution
      }
    });
  } catch (error) {
    console.error("❌ Get store reviews error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب التقييمات"
    });
  }
};

/**
 * @desc    الحصول على تقييمات المستخدم
 * @route   GET /api/v1/client/reviews/me
 * @access  Client
 */
exports.getMyReviews = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total] = await Promise.all([
      Review.find({ user: userId })
        .populate("store", "name image logo")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),

      Review.countDocuments({ user: userId })
    ]);

    res.json({
      success: true,
      data: reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("❌ Get my reviews error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب تقييماتك"
    });
  }
};

/**
 * @desc    تحديث تقييم
 * @route   PUT /api/v1/client/reviews/:id
 * @access  Client
 */
exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    const review = await Review.findOne({
      _id: id,
      user: userId
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "التقييم غير موجود"
      });
    }

    // تحديث الحقول
    if (rating) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "التقييم يجب أن يكون بين 1 و 5"
        });
      }
      review.rating = rating;
    }

    if (comment !== undefined) {
      if (comment && comment.length > 1000) {
        return res.status(400).json({
          success: false,
          message: "التعليق طويل جداً"
        });
      }
      review.comment = comment?.trim();
    }

    await review.save();

    // تحديث متوسط تقييم المتجر
    await updateStoreRating(review.store);

    // إبطال الكاش
    invalidateReviewCache(review.store);

    // جلب التقييم المحدث
    const updatedReview = await Review.findById(id)
      .populate('user', 'name image')
      .populate('store', 'name image')
      .lean();

    res.json({
      success: true,
      message: "تم تحديث التقييم بنجاح",
      data: updatedReview
    });
  } catch (error) {
    console.error("❌ Update review error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث التقييم"
    });
  }
};

/**
 * @desc    حذف تقييم
 * @route   DELETE /api/v1/client/reviews/:id
 * @access  Client / Admin
 */
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const query = userRole === 'admin' 
      ? { _id: id }
      : { _id: id, user: userId };

    const review = await Review.findOneAndDelete(query);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "التقييم غير موجود"
      });
    }

    // تحديث متوسط تقييم المتجر
    await updateStoreRating(review.store);

    // إبطال الكاش
    invalidateReviewCache(review.store);

    res.json({
      success: true,
      message: "تم حذف التقييم بنجاح"
    });
  } catch (error) {
    console.error("❌ Delete review error:", error);
    res.status(500).json({
      success: false,
      message: "فشل حذف التقييم"
    });
  }
};

/**
 * @desc    الحصول على تقييم محدد
 * @route   GET /api/v1/public/reviews/:id
 * @access  Public
 */
exports.getReviewById = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id)
      .populate('user', 'name image')
      .populate('store', 'name image logo')
      .lean();

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "التقييم غير موجود"
      });
    }

    res.json({
      success: true,
      data: review
    });
  } catch (error) {
    console.error("❌ Get review by id error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب التقييم"
    });
  }
};

// ========== 3. دوال إحصائية ==========

/**
 * @desc    إحصائيات تقييمات المتجر (للتاجر)
 * @route   GET /api/v1/vendor/reviews/stats
 * @access  Vendor
 */
exports.getVendorReviewStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // جلب المتجر الخاص بالتاجر
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const stats = await Review.aggregate([
      { $match: { store: storeId } },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                averageRating: { $avg: "$rating" },
                totalReviews: { $sum: 1 },
                fiveStar: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
                fourStar: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
                threeStar: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
                twoStar: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
                oneStar: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } }
              }
            }
          ],
          byMonth: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m", date: "$createdAt" }
                },
                count: { $sum: 1 },
                avgRating: { $avg: "$rating" }
              }
            },
            { $sort: { _id: -1 } },
            { $limit: 12 }
          ],
          recentReviews: [
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "userInfo"
              }
            }
          ]
        }
      }
    ]);

    const overview = stats[0]?.overview[0] || {
      averageRating: 0,
      totalReviews: 0,
      fiveStar: 0,
      fourStar: 0,
      threeStar: 0,
      twoStar: 0,
      oneStar: 0
    };

    // حساب النسب المئوية
    const percentages = {};
    if (overview.totalReviews > 0) {
      percentages.fiveStar = ((overview.fiveStar / overview.totalReviews) * 100).toFixed(1);
      percentages.fourStar = ((overview.fourStar / overview.totalReviews) * 100).toFixed(1);
      percentages.threeStar = ((overview.threeStar / overview.totalReviews) * 100).toFixed(1);
      percentages.twoStar = ((overview.twoStar / overview.totalReviews) * 100).toFixed(1);
      percentages.oneStar = ((overview.oneStar / overview.totalReviews) * 100).toFixed(1);
    }

    res.json({
      success: true,
      data: {
        overview,
        percentages,
        monthly: stats[0]?.byMonth || [],
        recent: stats[0]?.recentReviews.map(r => ({
          ...r,
          user: r.userInfo[0]
        })) || []
      }
    });
  } catch (error) {
    console.error("❌ Get vendor review stats error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب إحصائيات التقييمات"
    });
  }
};

/**
 * @desc    الحصول على تقييمات المتجر (للتاجر)
 * @route   GET /api/v1/vendor/reviews
 * @access  Vendor
 */
exports.getVendorReviews = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, rating } = req.query;

    // جلب المتجر الخاص بالتاجر
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { store: storeId };
    if (rating) {
      query.rating = parseInt(rating);
    }

    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate('user', 'name image')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),

      Review.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("❌ Get vendor reviews error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب تقييمات المتجر"
    });
  }
};

/**
 * @desc    الرد على تقييم (للتاجر)
 * @route   POST /api/v1/vendor/reviews/:id/reply
 * @access  Vendor
 */
exports.replyToReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;
    const userId = req.user.id;

    if (!reply || reply.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "الرد مطلوب"
      });
    }

    // جلب المتجر الخاص بالتاجر
    const user = await User.findById(userId).select('storeOwnerInfo');
    
    if (!user?.storeOwnerInfo?.store) {
      return res.status(404).json({
        success: false,
        message: "لم تقم بإنشاء متجر بعد"
      });
    }

    const storeId = user.storeOwnerInfo.store;

    // التحقق من أن التقييم يخص هذا المتجر
    const review = await Review.findOne({
      _id: id,
      store: storeId
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "التقييم غير موجود"
      });
    }

    // إضافة الرد
    review.reply = {
      text: reply.trim(),
      repliedAt: new Date(),
      repliedBy: userId
    };

    await review.save();

    // إبطال الكاش
    invalidateReviewCache(storeId);

    res.json({
      success: true,
      message: "تم إضافة الرد بنجاح",
      data: review
    });
  } catch (error) {
    console.error("❌ Reply to review error:", error);
    res.status(500).json({
      success: false,
      message: "فشل إضافة الرد"
    });
  }
};

/**
 * @desc    الإبلاغ عن تقييم
 * @route   POST /api/v1/client/reviews/:id/report
 * @access  Client
 */
exports.reportReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "سبب الإبلاغ مطلوب"
      });
    }

    const review = await Review.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "التقييم غير موجود"
      });
    }

    // إضافة بلاغ
    if (!review.reports) {
      review.reports = [];
    }

    review.reports.push({
      user: req.user.id,
      reason,
      reportedAt: new Date()
    });

    await review.save();

    res.json({
      success: true,
      message: "تم الإبلاغ عن التقييم بنجاح"
    });
  } catch (error) {
    console.error("❌ Report review error:", error);
    res.status(500).json({
      success: false,
      message: "فشل الإبلاغ عن التقييم"
    });
  }
};

module.exports = exports;