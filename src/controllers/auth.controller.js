// ============================================
// ملف: src/controllers/auth.controller.js (المصحح)
// الوصف: عمليات المصادقة الموحدة
// ============================================

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const cache = require("../utils/cache.util");
const SecurityCheck = require('../utils/securityCheck.util');

// ✅ استيراد موحد من models/index.js
const { User, RefreshToken } = require('../models');

// ========== 1. دوال مساعدة ==========

/**
 * إنشاء Access Token
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      phone: user.phone,
      name: user.name,
      email: user.email
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

/**
 * إنشاء Refresh Token
 */
const generateRefreshToken = async (user, deviceInfo = {}) => {
  const refreshToken = jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d" }
  );

  await RefreshToken.create({
    token: refreshToken,
    user: user._id,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    deviceInfo: {
      ip: deviceInfo.ip,
      userAgent: deviceInfo.userAgent,
      deviceId: deviceInfo.deviceId
    }
  });

  return refreshToken;
};

/**
 * إعداد بيانات المستخدم للرد
 */
const prepareUserResponse = (user) => {
  const userResponse = user.toObject();
  delete userResponse.password;
  delete userResponse.verificationCode;
  delete userResponse.resetPasswordToken;
  delete userResponse.loginAttempts;
  delete userResponse.lockUntil;
  return userResponse;
};

/**
 * إنشاء كود تحقق
 */
const generateVerificationCode = () => {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
};

// ========== 2. التسجيل ==========

/**
 * @desc    تسجيل مستخدم جديد
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.register = async (req, res) => {
  try {
    const { 
      name, phone, password, email, role = "client",
      dateOfBirth, gender, city, preferences
    } = req.body;

    // التحقق من البيانات الأساسية
    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "الاسم ورقم الهاتف وكلمة المرور مطلوبة"
      });
    }

    // فحص قوة كلمة المرور
    const passwordCheck = SecurityCheck.isPasswordStrong(password);
    if (!passwordCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور ضعيفة',
        requirements: passwordCheck.checks,
        score: passwordCheck.score
      });
    }

    // فحص الاسم من SQL Injection
    if (SecurityCheck.hasSqlInjection(name)) {
      return res.status(400).json({
        success: false,
        message: 'الاسم يحتوي على أحرف غير مسموحة'
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

    // التحقق من البريد الإلكتروني إذا وجد
    if (email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "البريد الإلكتروني مسجل بالفعل"
        });
      }
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);

    // تجهيز بيانات المستخدم
    const userData = {
      name,
      phone,
      password: hashedPassword,
      role,
      isVerified: false,
      isActive: true,
      stats: { joinedDate: new Date() },
      preferences: preferences || {
        notifications: { email: true, sms: true, push: true, orderUpdates: true, promotions: true },
        language: "ar",
        currency: "XOF",
        theme: "light",
      }
    };

    // إضافة البيانات الإضافية إذا وجدت
    if (email) userData.email = email;
    if (dateOfBirth) userData.dateOfBirth = new Date(dateOfBirth);
    if (gender) userData.gender = gender;
    if (city) userData.city = city;

    // إنشاء المستخدم
    const user = await User.create(userData);

    // إنشاء كود التحقق
    const verificationCode = generateVerificationCode();
    user.verificationCode = verificationCode;
    user.verificationCodeExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    // إنشاء التوكنات
    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      deviceId: req.body.deviceId
    });

    // تسجيل النشاط
    await user.logActivity("register", {
      method: email ? "complete" : "simple",
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    // إعداد الرد
    const userResponse = prepareUserResponse(user);

    const message = email 
      ? "تم التسجيل بنجاح. يرجى تفعيل حسابك عبر البريد الإلكتروني"
      : "تم التسجيل بنجاح. يرجى تفعيل حسابك";

    res.status(201).json({
      success: true,
      message,
      data: {
        user: userResponse,
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
        verificationCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined,
        nextStep: "verify_account"
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

// ========== 3. تسجيل الدخول ==========

/**
 * @desc    تسجيل الدخول (يدعم الهاتف أو البريد الإلكتروني)
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res) => {
  try {
    const { phone, email, password, deviceId } = req.body;

    // التحقق من البيانات
    if ((!phone && !email) || !password) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف أو البريد الإلكتروني وكلمة المرور مطلوبة"
      });
    }

    // البحث عن المستخدم
    let query = {};
    if (phone) query.phone = phone;
    if (email) query.email = email;

    const user = await User.findOne(query).select('+password +isActive +isVerified +loginAttempts +lockUntil');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "بيانات الدخول غير صحيحة"
      });
    }

    // تحقق من قفل الحساب
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingTime = Math.ceil((user.lockUntil - new Date()) / 60000);
      return res.status(403).json({
        success: false,
        message: `الحساب مقفل. حاول مرة أخرى بعد ${remainingTime} دقائق`,
        code: "ACCOUNT_LOCKED"
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
      await user.incLoginAttempts();
      return res.status(400).json({
        success: false,
        message: "بيانات الدخول غير صحيحة"
      });
    }

    // إعادة تعيين محاولات الدخول الفاشلة
    await user.resetLoginAttempts();

    // إنشاء التوكنات
    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      deviceId
    });

    // تسجيل نشاط الدخول
    await user.logActivity("login", {
      method: email ? "email" : "phone",
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    // تحديث آخر دخول
    user.lastLogin = new Date();
    user.isOnline = true;
    await user.save({ validateBeforeSave: false });

    const userResponse = prepareUserResponse(user);

    // تحقق من حالة التوثيق
    const verificationNeeded = !user.isVerified && process.env.REQUIRE_VERIFICATION === 'true';

    res.json({
      success: true,
      message: "تم تسجيل الدخول بنجاح",
      data: {
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
        user: userResponse,
        verificationNeeded
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

// ========== 4. دوال التوكنات ==========

/**
 * @desc    تجديد التوكن
 * @route   POST /api/auth/refresh
 * @access  Public
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

    const tokenDoc = await RefreshToken.findOne({
      token: refreshToken,
      revokedAt: null
    }).populate('user', 'name phone email role isActive');

    if (!tokenDoc) {
      return res.status(401).json({
        success: false,
        message: "Refresh token غير صالح",
        code: "INVALID_REFRESH_TOKEN"
      });
    }

    if (tokenDoc.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ _id: tokenDoc._id });
      return res.status(401).json({
        success: false,
        message: "Refresh token منتهي الصلاحية",
        code: "REFRESH_TOKEN_EXPIRED"
      });
    }

    const user = tokenDoc.user;

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "الحساب معطل",
        code: "ACCOUNT_DISABLED"
      });
    }

    const accessToken = generateAccessToken(user);
    const newRefreshToken = await generateRefreshToken(user, tokenDoc.deviceInfo);

    tokenDoc.revokedAt = new Date();
    tokenDoc.replacedByToken = newRefreshToken;
    await tokenDoc.save();

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
        expiresIn: process.env.JWT_EXPIRES_IN || "7d"
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
 * @desc    تسجيل الخروج
 * @route   POST /api/auth/logout
 * @access  Authenticated
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

      await user.logActivity("logout", {
        ip: req.ip,
        userAgent: req.get("user-agent")
      });
    }

    if (refreshToken) {
      await RefreshToken.findOneAndUpdate(
        { token: refreshToken },
        { revokedAt: new Date() }
      );
    }

    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      await cache.set(`token:blacklist:${token}`, true, 3600);
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
 * @desc    إبطال جميع جلسات المستخدم
 * @route   POST /api/auth/revoke-all-sessions
 * @access  Authenticated
 */
exports.revokeAllSessions = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await RefreshToken.updateMany(
      { user: userId, revokedAt: null },
      { revokedAt: new Date() }
    );

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
 * @desc    التحقق من صلاحية Token
 * @route   GET /api/auth/validate
 * @access  Public
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

    const isBlacklisted = await cache.get(`token:blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: "Token is invalid"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

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

// ========== 5. دوال التحقق والتوثيق ==========

/**
 * @desc    تفعيل الحساب
 * @route   POST /api/auth/verify
 * @access  Public
 */
exports.verifyAccount = async (req, res) => {
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
        message: "رمز التحقق غير صالح أو منتهي الصلاحية",
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

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user, {
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({
      success: true,
      message: "تم تفعيل الحساب بنجاح",
      data: {
        user: prepareUserResponse(user),
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "7d"
      },
    });
  } catch (error) {
    console.error("❌ Verification error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تفعيل الحساب",
    });
  }
};

/**
 * @desc    إعادة إرسال كود التحقق
 * @route   POST /api/auth/resend-verification
 * @access  Public
 */
exports.resendVerification = async (req, res) => {
  try {
    const { phone } = req.body;

    const user = await User.findOne({ phone, isVerified: false });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود أو تم تفعيل الحساب مسبقاً",
      });
    }

    const verificationCode = generateVerificationCode();
    user.verificationCode = verificationCode;
    user.verificationCodeExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    res.json({
      success: true,
      message: "تم إرسال رمز التحقق بنجاح",
      data: {
        phone: user.phone,
        verificationCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined,
        expiresIn: "24 ساعة",
      },
    });
  } catch (error) {
    console.error("❌ Resend verification error:", error);
    res.status(500).json({
      success: false,
      message: "فشل إعادة إرسال رمز التحقق",
    });
  }
};

// ========== 6. دوال كلمة المرور ==========

/**
 * @desc    تغيير كلمة المرور
 * @route   POST /api/auth/change-password
 * @access  Authenticated
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const passwordCheck = SecurityCheck.isPasswordStrong(newPassword);
    if (!passwordCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور الجديدة ضعيفة',
        requirements: passwordCheck.checks
      });
    }

    const user = await User.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور الحالية غير صحيحة"
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = Date.now();
    await user.save();

    await RefreshToken.updateMany(
      { user: userId, revokedAt: null },
      { revokedAt: new Date() }
    );

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
 * @desc    نسيت كلمة المرور
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
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
      message: "تم إرسال تعليمات إعادة تعيين كلمة المرور",
      data: {
        phone: user.phone,
        resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined,
        expiresIn: "10 دقائق",
      },
    });
  } catch (error) {
    console.error("❌ Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "فشل معالجة طلب إعادة تعيين كلمة المرور",
    });
  }
};

/**
 * @desc    إعادة تعيين كلمة المرور
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
exports.resetPassword = async (req, res) => {
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
        message: "رمز إعادة التعيين غير صالح أو منتهي الصلاحية",
      });
    }

    const passwordCheck = SecurityCheck.isPasswordStrong(newPassword);
    if (!passwordCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور ضعيفة',
        requirements: passwordCheck.checks
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    await RefreshToken.updateMany(
      { user: user._id, revokedAt: null },
      { revokedAt: new Date() }
    );

    await user.logActivity("password_reset", {
      method: "reset_token",
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "تم إعادة تعيين كلمة المرور بنجاح",
    });
  } catch (error) {
    console.error("❌ Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "فشل إعادة تعيين كلمة المرور",
    });
  }
};
