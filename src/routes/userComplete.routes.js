const express = require("express");
const router = express.Router();
const userCompleteController = require("../controllers/userComplete.controller");
const authController = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
// في routes/userComplete.routes.js - إضافة في الأعلى
const User = require("../models/user.model");
const Order = require("../models/order.model");

/**
 * 🔐 Authentication Routes
 */

// تسجيل جديد متقدم
router.post("/auth/register/complete", authController.registerComplete);

// تسجيل دخول متقدم
router.post("/auth/login/complete", authController.loginComplete);

// تأكيد الحساب
router.post("/auth/verify", authController.verifyAccount);

// إعادة إرسال كود التحقق
router.post("/auth/resend-verification", authController.resendVerification);

// نسيت كلمة المرور
router.post("/auth/forgot-password", authController.forgotPassword);

// إعادة تعيين كلمة المرور
router.post("/auth/reset-password", authController.resetPassword);

// تسجيل الخروج
router.post("/auth/logout", auth, authController.logout);

// التحقق من صلاحية Token
router.get("/auth/validate", auth, authController.validateToken);

/**
 * 👤 User Profile Routes (Authenticated)
 */

// الحصول على الملف الشخصي الكامل
router.get("/users/me/complete", auth, userCompleteController.getMyCompleteProfile);

// تحديث الملف الشخصي
router.put("/users/me/complete", auth, userCompleteController.updateCompleteProfile);

// تحديث الصورة الشخصية
router.put(
  "/users/me/avatar",
  auth,
  upload("users/avatars").single("image"),
  userCompleteController.updateAvatar
);

// تحديث صورة الغلاف
router.put(
  "/users/me/cover",
  auth,
  upload("users/covers").single("image"),
  userCompleteController.updateCoverImage
);

// تغيير كلمة المرور
router.put("/users/me/password", auth, userCompleteController.changePassword);

// إدارة المفضلة
router.post("/users/me/favorites/:restaurantId", auth, userCompleteController.toggleFavorite);

// الحصول على سجل النشاطات
router.get("/users/me/activity", auth, userCompleteController.getActivityLog);

// الحصول على إحصائيات المستخدم
router.get("/users/me/stats", auth, userCompleteController.getUserStats);

// تحديث حالة التواجد
router.put("/users/me/presence", auth, userCompleteController.updatePresence);

/**
 * 👑 Admin Routes (Admin only)
 */

// الحصول على جميع المستخدمين مع Pagination
router.get("/admin/users", auth, role("admin"), async (req, res) => {
  try {
    const PaginationUtils = require("../utils/pagination.util");
    const paginationOptions = PaginationUtils.getPaginationOptions(req);
    const { skip, limit, sort, search, filters } = paginationOptions;
    
    let query = {};
    
    // البحث
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    
    // الفلاتر
    if (filters.role) query.role = filters.role;
    if (filters.isVerified !== undefined) query.isVerified = filters.isVerified === "true";
    if (filters.isActive !== undefined) query.isActive = filters.isActive === "true";
    
    if (filters.minDate || filters.maxDate) {
      query.createdAt = {};
      if (filters.minDate) query.createdAt.$gte = new Date(filters.minDate);
      if (filters.maxDate) query.createdAt.$lte = new Date(filters.maxDate);
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password -verificationCode -resetPasswordToken -activityLog")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      
      User.countDocuments(query),
    ]);

    // إحصائيات الأدمن
    const stats = await User.aggregate([
      { $match: query },
      {
        $facet: {
          byRole: [
            {
              $group: {
                _id: "$role",
                count: { $sum: 1 },
              },
            },
          ],
          byStatus: [
            {
              $group: {
                _id: "$isActive",
                count: { $sum: 1 },
              },
            },
          ],
          byVerification: [
            {
              $group: {
                _id: "$isVerified",
                count: { $sum: 1 },
              },
            },
          ],
          growth: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m", date: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: -1 } },
            { $limit: 6 },
          ],
        },
      },
    ]);

    const response = PaginationUtils.createPaginationResponse(
      users,
      total,
      paginationOptions,
      {
        stats: {
          byRole: stats[0]?.byRole || [],
          byStatus: stats[0]?.byStatus || [],
          byVerification: stats[0]?.byVerification || [],
          growth: stats[0]?.growth || [],
        },
      }
    );

    res.json(response);
  } catch (error) {
    console.error("Admin users error:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// الحصول على مستخدم واحد (للأدمن)
router.get("/admin/users/:id", auth, role("admin"), async (req, res) => {
  try {
    const userId = req.params.id;
    
    const user = await User.findById(userId)
      .select("-password -verificationCode -resetPasswordToken")
      .populate("favorites", "name image")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // جلب البيانات الإضافية
    const [orders, addresses, reviews] = await Promise.all([
      Order.find({ user: userId })
        .populate("restaurant", "name")
        .populate("driver", "name")
        .sort({ createdAt: -1 })
        .limit(10),
      
      Address.find({ user: userId }),
      
      Review.find({ user: userId })
        .populate("restaurant", "name image")
        .sort({ createdAt: -1 })
        .limit(10),
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
          totalReviews: reviews.length,
        },
      },
    });
  } catch (error) {
    console.error("Admin user detail error:", error);
    res.status(500).json({ message: "Failed to fetch user details" });
  }
});

// تحديث مستخدم (للأدمن)
router.put("/admin/users/:id", auth, role("admin"), async (req, res) => {
  try {
    const userId = req.params.id;
    const updateData = req.body;

    // إزالة الحقول المحمية
    delete updateData.password;
    delete updateData._id;
    delete updateData.createdAt;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password -verificationCode -resetPasswordToken");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // تسجيل النشاط
    await user.logActivity("admin_updated", {
      updatedBy: req.user.id,
      updatedFields: Object.keys(updateData),
    }, req);

    res.json({
      success: true,
      message: "User updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Admin update user error:", error);
    res.status(500).json({ message: "Failed to update user" });
  }
});

// حذف مستخدم (للأدمن)
router.delete("/admin/users/:id", auth, role("admin"), async (req, res) => {
  try {
    const userId = req.params.id;
    
    // التحقق إذا كان المستخدم هو الأدمن الرئيسي
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // منع حذف الأدمن الرئيسي
    if (user.role === "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "Cannot delete the only admin user",
        });
      }
    }

    // Soft delete - تعطيل الحساب
    user.isActive = false;
    await user.save();

    // تسجيل النشاط
    await user.logActivity("account_deactivated", {
      deactivatedBy: req.user.id,
      reason: req.body.reason || "Administrative action",
    }, req);

    res.json({
      success: true,
      message: "User account deactivated",
    });
  } catch (error) {
    console.error("Admin delete user error:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

module.exports = router;