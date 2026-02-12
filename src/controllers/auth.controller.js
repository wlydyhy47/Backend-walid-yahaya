// /opt/render/project/src/src/controllers/auth.controller.js

const User = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const cache = require("../utils/cache.util");
const RefreshToken = require("../models/refreshToken.model");

/**
 * 📝 تسجيل مستخدم جديد (بسيط)
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    // التحقق من البيانات
    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "الاسم ورقم الهاتف وكلمة المرور مطلوبة"
      });
    }

    // التحقق من وجود المستخدم
    const exists = await User.findOne({ phone });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف مسجل بالفعل"
      });
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);

    // إنشاء المستخدم
    const user = await User.create({
      name,
      phone,
      password: hashedPassword,
      role: "client",
      isVerified: false,
      isActive: true
    });

    // إنشاء كود التحقق
    const verificationCode = crypto.randomBytes(3).toString("hex").toUpperCase();
    user.verificationCode = verificationCode;
    user.verificationCodeExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    // تسجيل النشاط
    await user.logActivity("register", {
      method: "simple",
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    res.status(201).json({
      success: true,
      message: "تم التسجيل بنجاح. الرجاء تفعيل الحساب",
      data: {
        userId: user._id,
        phone: user.phone,
        verificationCode // للتطوير فقط
      }
    });

  } catch (error) {
    console.error("❌ Register error:", error);
    res.status(500).json({
      success: false,
      message: "فشل التسجيل"
    });
  }
};

/**
 * 🔐 تسجيل الدخول (بسيط)
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // التحقق من البيانات
    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف وكلمة المرور مطلوبة"
      });
    }

    // البحث عن المستخدم
    const user = await User.findOne({ phone }).select('+password +isActive +isVerified');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف أو كلمة المرور غير صحيحة"
      });
    }

    // تحقق من حالة الحساب
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "الحساب معطل، الرجاء التواصل مع الدعم"
      });
    }

    // تحقق من كلمة المرور
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف أو كلمة المرور غير صحيحة"
      });
    }

    // إنشاء Access Token
    const accessToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
        phone: user.phone,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1h" }
    );

    // إنشاء Refresh Token
    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" }
    );

    // حفظ Refresh Token في قاعدة البيانات
    await RefreshToken.create({
      token: refreshToken,
      user: user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 أيام
      deviceInfo: {
        ip: req.ip,
        userAgent: req.get("user-agent"),
        deviceId: req.body.deviceId
      }
    });

    // تسجيل نشاط الدخول
    await user.logActivity("login", {
      method: "simple",
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    // تحديث آخر دخول
    user.lastLogin = new Date();
    user.isOnline = true;
    await user.save({ validateBeforeSave: false });

    // إعداد بيانات المستخدم للرد
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.verificationCode;
    delete userResponse.resetPasswordToken;

    res.json({
      success: true,
      message: "تم تسجيل الدخول بنجاح",
      data: {
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "1h",
        user: userResponse
      }
    });

  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تسجيل الدخول"
    });
  }
};

/**
 * 🔄 تجديد التوكن
 * POST /api/auth/refresh
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token مطلوب",
        code: "REFRESH_TOKEN_REQUIRED"
      });
    }

    // التحقق من وجود التوكن في قاعدة البيانات
    const tokenDoc = await RefreshToken.findOne({
      token: refreshToken,
      revokedAt: null
    }).populate('user');

    if (!tokenDoc) {
      return res.status(401).json({
        success: false,
        message: "Refresh token غير صالح",
        code: "INVALID_REFRESH_TOKEN"
      });
    }

    // التحقق من صلاحية التوكن
    if (tokenDoc.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ _id: tokenDoc._id });
      return res.status(401).json({
        success: false,
        message: "Refresh token منتهي الصلاحية",
        code: "REFRESH_TOKEN_EXPIRED"
      });
    }

    const user = tokenDoc.user;

    // التحقق من حالة المستخدم
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "الحساب معطل",
        code: "ACCOUNT_DISABLED"
      });
    }

    // إنشاء Access Token جديد
    const accessToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
        phone: user.phone,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1h" }
    );

    // إنشاء Refresh Token جديد
    const newRefreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" }
    );

    // إبطال التوكن القديم
    tokenDoc.revokedAt = new Date();
    tokenDoc.replacedByToken = newRefreshToken;
    await tokenDoc.save();

    // حفظ التوكن الجديد
    await RefreshToken.create({
      token: newRefreshToken,
      user: user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      deviceInfo: tokenDoc.deviceInfo
    });

    // تسجيل النشاط
    await user.logActivity("token_refresh", {
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({
      success: true,
      message: "تم تجديد التوكن بنجاح",
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "1h"
      }
    });

  } catch (error) {
    console.error("❌ Refresh token error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تجديد التوكن",
      code: "REFRESH_TOKEN_FAILED"
    });
  }
};

/**
 * 🚪 تسجيل الخروج
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    const userId = req.user.id;
    const { refreshToken } = req.body;

    const user = await User.findById(userId);
    if (user) {
      user.isOnline = false;
      user.lastActivity = new Date();
      await user.save();

      // تسجيل النشاط
      await user.logActivity("logout", {
        ip: req.ip,
        userAgent: req.get("user-agent")
      });
    }

    // إبطال Refresh Token
    if (refreshToken) {
      await RefreshToken.findOneAndUpdate(
        { token: refreshToken },
        { revokedAt: new Date() }
      );
    }

    // إبطال Access Token (إضافته للـ blacklist)
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      await cache.set(`token:blacklist:${token}`, true, 3600); // ساعة واحدة
    }

    res.json({
      success: true,
      message: "تم تسجيل الخروج بنجاح"
    });

  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تسجيل الخروج"
    });
  }
};

/**
 * 🔐 تسجيل الدخول المتقدم
 * POST /api/auth/login/complete
 */
exports.loginComplete = async (req, res) => {
  try {
    const { phone, password, email } = req.body;

    let user;

    // محاولة الدخول بالهاتف أولاً
    if (phone) {
      user = await User.findOne({ phone }).select("+password +isActive +isVerified");
    }
    // ثم محاولة الدخول بالبريد الإلكتروني
    else if (email) {
      user = await User.findOne({ email }).select("+password +isActive +isVerified");
    } else {
      return res.status(400).json({
        success: false,
        message: "الهاتف أو البريد الإلكتروني مطلوب"
      });
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "بيانات الدخول غير صحيحة"
      });
    }

    // التحقق من كلمة المرور
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "بيانات الدخول غير صحيحة"
      });
    }

    // التحقق من حالة الحساب
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "الحساب معطل، يرجى التواصل مع الدعم"
      });
    }

    // إنشاء Access Token
    const accessToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
        phone: user.phone,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1h" }
    );

    // إنشاء Refresh Token
    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" }
    );

    // حفظ Refresh Token
    await RefreshToken.create({
      token: refreshToken,
      user: user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      deviceInfo: {
        ip: req.ip,
        userAgent: req.get("user-agent"),
        deviceId: req.body.deviceId
      }
    });

    // تحديث آخر تسجيل دخول
    user.lastLogin = new Date();
    user.isOnline = true;
    await user.save();

    // تسجيل النشاط
    await user.logActivity("login", {
      method: "complete",
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    // إعداد بيانات المستخدم
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.verificationCode;
    delete userResponse.resetPasswordToken;

    res.json({
      success: true,
      message: "تم تسجيل الدخول بنجاح",
      data: {
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "1h",
        user: userResponse
      }
    });

  } catch (error) {
    console.error("❌ Login complete error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تسجيل الدخول"
    });
  }
};

/**
 * 🔑 تغيير كلمة المرور
 * POST /api/auth/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    // التحقق من كلمة المرور الحالية
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور الحالية غير صحيحة"
      });
    }

    // تحديث كلمة المرور
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // إبطال جميع Refresh Tokens للمستخدم
    await RefreshToken.updateMany(
      { user: userId, revokedAt: null },
      { revokedAt: new Date() }
    );

    // تسجيل النشاط
    await user.logActivity("password_change", {
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({
      success: true,
      message: "تم تغيير كلمة المرور بنجاح"
    });

  } catch (error) {
    console.error("❌ Change password error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تغيير كلمة المرور"
    });
  }
};

/**
 * 🚫 إبطال جميع جلسات المستخدم
 * POST /api/auth/revoke-all-sessions
 */
exports.revokeAllSessions = async (req, res) => {
  try {
    const userId = req.user.id;

    // إبطال جميع Refresh Tokens
    const result = await RefreshToken.updateMany(
      { user: userId, revokedAt: null },
      { revokedAt: new Date() }
    );

    // تسجيل النشاط
    const user = await User.findById(userId);
    if (user) {
      await user.logActivity("revoke_all_sessions", {
        ip: req.ip,
        userAgent: req.get("user-agent")
      });
    }

    res.json({
      success: true,
      message: "تم إبطال جميع الجلسات بنجاح",
      data: {
        revokedCount: result.modifiedCount
      }
    });

  } catch (error) {
    console.error("❌ Revoke all sessions error:", error);
    res.status(500).json({
      success: false,
      message: "فشل إبطال الجلسات"
    });
  }
};

/**
 * 🔍 التحقق من صلاحية Token
 * GET /api/auth/validate
 */
exports.validateToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided"
      });
    }

    // التحقق من blacklist
    const isBlacklisted = await cache.get(`token:blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: "Token is invalid"
      });
    }

    // التحقق من صلاحية Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // جلب بيانات المستخدم
    const user = await User.findById(decoded.id)
      .select("-password -verificationCode -resetPasswordToken");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found"
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated"
      });
    }

    res.json({
      success: true,
      message: "Token is valid",
      data: {
        user,
        tokenInfo: {
          expiresAt: new Date(decoded.exp * 1000),
          issuedAt: new Date(decoded.iat * 1000)
        }
      }
    });

  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token"
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired"
      });
    }

    console.error("❌ Token validation error:", error);
    res.status(500).json({
      success: false,
      message: "Token validation failed"
    });
  }
};

// ========== الدوال الموجودة مسبقاً (registerComplete, verifyAccount, etc) ==========

/**
 * 🔐 تسجيل مستخدم جديد متقدم
 * POST /api/auth/register/complete
 */
exports.registerComplete = async (req, res) => {
  // الكود الموجود مسبقاً - لم يتم تغييره
  try {
    const { name, phone, password, email, role = "client", ...additionalData } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, phone, and password are required",
      });
    }

    const exists = await User.findOne({ phone });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    const userData = {
      name,
      phone,
      password: await bcrypt.hash(password, 10),
      email,
      role,
      isVerified: false,
      stats: { joinedDate: new Date() },
      preferences: {
        notifications: { email: true, sms: true, push: true, orderUpdates: true, promotions: true },
        language: "ar",
        currency: "XOF",
        theme: "light",
      },
    };

    if (additionalData.dateOfBirth) userData.dateOfBirth = new Date(additionalData.dateOfBirth);
    if (additionalData.gender) userData.gender = additionalData.gender;
    if (additionalData.city) userData.city = additionalData.city;

    const user = await User.create(userData);

    const verificationCode = crypto.randomBytes(3).toString("hex").toUpperCase();
    user.verificationCode = verificationCode;
    user.verificationCodeExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    await user.logActivity("registered", {
      method: "email",
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      message: "Registration successful. Please verify your account.",
      data: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
        },
        token,
        verificationCode,
        nextStep: "verify_account",
      },
    });
  } catch (error) {
    console.error("❌ Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
};

/**
 * 📧 تأكيد الحساب
 * POST /api/auth/verify
 */
exports.verifyAccount = async (req, res) => {
  // الكود الموجود مسبقاً
  try {
    const { phone, verificationCode } = req.body;

    const user = await User.findOne({
      phone,
      verificationCode,
      verificationCodeExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification code",
      });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    await user.logActivity("account_verified", {
      method: "code",
      ip: req.ip,
    });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      message: "Account verified successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          isVerified: user.isVerified,
        },
        token,
      },
    });
  } catch (error) {
    console.error("❌ Verification error:", error);
    res.status(500).json({
      success: false,
      message: "Verification failed",
    });
  }
};

/**
 * 🔄 إعادة إرسال كود التحقق
 * POST /api/auth/resend-verification
 */
exports.resendVerification = async (req, res) => {
  // الكود الموجود مسبقاً
  try {
    const { phone } = req.body;

    const user = await User.findOne({ phone, isVerified: false });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found or already verified",
      });
    }

    const verificationCode = crypto.randomBytes(3).toString("hex").toUpperCase();
    user.verificationCode = verificationCode;
    user.verificationCodeExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    res.json({
      success: true,
      message: "Verification code sent successfully",
      data: {
        phone: user.phone,
        verificationCode,
        expiresIn: "24 hours",
      },
    });
  } catch (error) {
    console.error("❌ Resend verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resend verification",
    });
  }
};

/**
 * 🔑 نسيت كلمة المرور
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  // الكود الموجود مسبقاً
  try {
    const { phone } = req.body;

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    res.json({
      success: true,
      message: "Password reset instructions sent",
      data: {
        phone: user.phone,
        resetToken,
        expiresIn: "10 minutes",
      },
    });
  } catch (error) {
    console.error("❌ Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process forgot password",
    });
  }
};

/**
 * 🔄 إعادة تعيين كلمة المرور
 * POST /api/auth/reset-password
 */
exports.resetPassword = async (req, res) => {
  // الكود الموجود مسبقاً
  try {
    const { phone, resetToken, newPassword } = req.body;

    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    const user = await User.findOne({
      phone,
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    await user.logActivity("password_reset", {
      method: "reset_token",
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("❌ Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset password",
    });
  }
};

module.exports = exports;