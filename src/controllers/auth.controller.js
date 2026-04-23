// ============================================
// ملف: src/controllers/auth.controller.js
// ============================================

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const cache = require("../utils/cache.util");
const SecurityCheck = require('../utils/securityCheck.util');
const { User, RefreshToken } = require('../models');
const { otpService } = require('../services');

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

const prepareUserResponse = (user) => {
  const userResponse = user.toObject();
  delete userResponse.password;
  delete userResponse.verificationCode;
  delete userResponse.resetPasswordToken;
  delete userResponse.loginAttempts;
  delete userResponse.lockUntil;
  return userResponse;
};

const generateVerificationCode = () => {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
};

exports.register = async (req, res) => {
  try {
    const {
      name, phone, password, email, role = "client",
      dateOfBirth, gender, city, preferences,
      otpToken
    } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "الاسم ورقم الهاتف وكلمة المرور مطلوبة"
      });
    }

    if (!otpToken) {
      return res.status(400).json({
        success: false,
        message: "يرجى التحقق من رقم الهاتف أولاً",
        nextStep: "verify_phone",
        code: "PHONE_VERIFICATION_REQUIRED"
      });
    }

    const verifiedPhone = otpService.getVerifiedPhone(otpToken);
    if (!verifiedPhone || verifiedPhone !== phone) {
      return res.status(400).json({
        success: false,
        message: "رمز التحقق غير صالح أو منتهي الصلاحية",
        code: "INVALID_OTP_TOKEN"
      });
    }

    const passwordCheck = SecurityCheck.isPasswordStrong(password);
    if (!passwordCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور ضعيفة',
        requirements: passwordCheck.checks,
        score: passwordCheck.score
      });
    }

    if (SecurityCheck.hasSqlInjection(name)) {
      return res.status(400).json({
        success: false,
        message: 'الاسم يحتوي على أحرف غير مسموحة'
      });
    }

    const exists = await User.findOne({ phone });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف مسجل بالفعل"
      });
    }

    if (email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "البريد الإلكتروني مسجل بالفعل"
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userData = {
      name,
      phone,
      password: hashedPassword,
      role,
      isVerified: true,
      isActive: true,
      stats: { joinedDate: new Date() },
      preferences: preferences || {
        notifications: { email: true, sms: true, push: true, orderUpdates: true, promotions: true },
        language: "ar",
        currency: "XOF",
        theme: "light",
      },
      // ✅ للمندوبين: تعيين الحالة الافتراضية
      ...(role === 'driver' && {
        isOnline: false,
        driverInfo: {
          isAvailable: false,  // ← غير متاح للطلبات افتراضياً
          currentLocation: null,
          rating: 0,
          totalDeliveries: 0,
          earnings: 0,
          documents: []
        }
      })
    };

    if (email) userData.email = email;
    if (dateOfBirth) userData.dateOfBirth = new Date(dateOfBirth);
    if (gender) userData.gender = gender;
    if (city) userData.city = city;

    const user = await User.create(userData);
    otpService.clearVerifiedToken(otpToken);

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      deviceId: req.body.deviceId
    });

    await user.logActivity("register", {
      method: email ? "complete" : "simple",
      ip: req.ip,
      userAgent: req.get("user-agent"),
      phoneVerified: true
    });

    const userResponse = prepareUserResponse(user);

    res.status(201).json({
      success: true,
      message: "تم التسجيل بنجاح",
      data: {
        user: userResponse,
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
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

exports.login = async (req, res) => {
  try {
    const { phone, email, password, deviceId, requireOTP = false } = req.body;

    if ((!phone && !email) || !password) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف أو البريد الإلكتروني وكلمة المرور مطلوبة"
      });
    }

    let query = {};
    if (phone) query.phone = phone;
    if (email) query.email = email;

    const user = await User.findOne(query).select('+password +isActive +isVerified +loginAttempts +lockUntil +twoFactorEnabled');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "بيانات الدخول غير صحيحة"
      });
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingTime = Math.ceil((user.lockUntil - new Date()) / 60000);
      return res.status(403).json({
        success: false,
        message: `الحساب مقفل. حاول مرة أخرى بعد ${remainingTime} دقائق`,
        code: "ACCOUNT_LOCKED"
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "الحساب معطل، الرجاء التواصل مع الدعم"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await user.incLoginAttempts();
      return res.status(400).json({
        success: false,
        message: "بيانات الدخول غير صحيحة"
      });
    }

    if (requireOTP || user.twoFactorEnabled) {
      const tempOTP = otpService.generateSecureOTP();
      otpService.storeOTP(phone, tempOTP, 5 * 60 * 1000);

      if (process.env.NODE_ENV === 'production') {
        await otpService.sendOTP(phone, tempOTP);
      } else {
        otpService.logOTPForDevelopment(phone, tempOTP);
      }

      return res.status(202).json({
        success: true,
        message: "يرجى إدخال رمز التحقق المرسل إلى رقم هاتفك",
        requiresOTP: true,
        data: {
          phone,
          tempId: phone,
          expiresIn: "5 دقائق"
        }
      });
    }

    await user.resetLoginAttempts();

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      deviceId
    });

    await user.logActivity("login", {
      method: email ? "email" : "phone",
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    user.lastLogin = new Date();
    user.isOnline = true;
    await user.save({ validateBeforeSave: false });

    const userResponse = prepareUserResponse(user);

    res.json({
      success: true,
      message: "تم تسجيل الدخول بنجاح",
      data: {
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
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

exports.verifyLoginOTP = async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف ورمز التحقق مطلوبان"
      });
    }

    const verification = otpService.verifyOTP(phone, code);

    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.message
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "الحساب معطل"
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      deviceId: req.body.deviceId
    });

    await user.logActivity("login_otp_verified", {
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    user.lastLogin = new Date();
    user.isOnline = true;
    await user.save({ validateBeforeSave: false });

    const userResponse = prepareUserResponse(user);

    res.json({
      success: true,
      message: "تم التحقق وتسجيل الدخول بنجاح",
      data: {
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
        user: userResponse
      }
    });

  } catch (error) {
    console.error("❌ Verify login OTP error:", error);
    res.status(500).json({
      success: false,
      message: "فشل التحقق من الرمز"
    });
  }
};

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

    const otp = otpService.generateSecureOTP();
    otpService.storeOTP(phone, otp, 10 * 60 * 1000);

    if (process.env.NODE_ENV === 'production') {
      await otpService.sendOTP(phone, otp);
    } else {
      otpService.logOTPForDevelopment(phone, otp);
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
      message: "تم إرسال رمز التحقق إلى رقم هاتفك",
      data: {
        phone: user.phone,
        method: "otp",
        expiresIn: "10 دقائق",
        ...(process.env.NODE_ENV !== 'production' && { devOTP: otp }),
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

exports.resetPassword = async (req, res) => {
  try {
    const { phone, code, newPassword } = req.body;

    const verification = otpService.verifyOTP(phone, code);

    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.message
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
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
      method: "otp",
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

exports.sendPhoneVerification = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف مطلوب"
      });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف مسجل بالفعل"
      });
    }

    const otp = otpService.generateSecureOTP();
    otpService.storeOTP(phone, otp);

    if (process.env.NODE_ENV === 'production') {
      await otpService.sendOTP(phone, otp);
    } else {
      otpService.logOTPForDevelopment(phone, otp);
    }

    res.json({
      success: true,
      message: "تم إرسال رمز التحقق بنجاح",
      data: {
        phone,
        expiresIn: "10 دقائق",
        ...(process.env.NODE_ENV !== 'production' && { devOTP: otp }),
      },
    });
  } catch (error) {
    console.error("❌ Send phone verification error:", error);
    res.status(500).json({
      success: false,
      message: "فشل إرسال رمز التحقق"
    });
  }
};

exports.verifyPhone = async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف ورمز التحقق مطلوبان"
      });
    }

    const verification = otpService.verifyOTP(phone, code);

    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.message
      });
    }

    const tempToken = crypto.randomBytes(32).toString('hex');
    otpService.storeVerifiedPhone(phone, tempToken);

    res.json({
      success: true,
      message: "تم التحقق من رقم الهاتف بنجاح",
      data: {
        phone,
        tempToken,
        expiresIn: "5 دقائق",
      },
    });
  } catch (error) {
    console.error("❌ Verify phone error:", error);
    res.status(500).json({
      success: false,
      message: "فشل التحقق من الرمز"
    });
  }
};

exports.enableTwoFactor = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    const targetPhone = phone || user.phone;

    const otp = otpService.generateSecureOTP();
    otpService.storeOTP(targetPhone, otp, 10 * 60 * 1000);

    if (process.env.NODE_ENV === 'production') {
      await otpService.sendOTP(targetPhone, otp);
    } else {
      otpService.logOTPForDevelopment(targetPhone, otp);
    }

    res.json({
      success: true,
      message: "تم إرسال رمز التحقق لتفعيل المصادقة الثنائية",
      data: {
        phone: targetPhone,
        expiresIn: "10 دقائق",
        ...(process.env.NODE_ENV !== 'production' && { devOTP: otp }),
      },
    });
  } catch (error) {
    console.error("❌ Enable 2FA error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تفعيل المصادقة الثنائية"
    });
  }
};

exports.confirmTwoFactor = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone, code } = req.body;

    const verification = otpService.verifyOTP(phone, code);

    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.message
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    user.twoFactorEnabled = true;
    user.twoFactorPhone = phone;
    await user.save();

    await user.logActivity("two_factor_enabled", {
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({
      success: true,
      message: "تم تفعيل المصادقة الثنائية بنجاح"
    });
  } catch (error) {
    console.error("❌ Confirm 2FA error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تفعيل المصادقة الثنائية"
    });
  }
};

exports.disableTwoFactor = async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور غير صحيحة"
      });
    }

    user.twoFactorEnabled = false;
    user.twoFactorPhone = undefined;
    await user.save();

    await user.logActivity("two_factor_disabled", {
      ip: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({
      success: true,
      message: "تم تعطيل المصادقة الثنائية بنجاح"
    });
  } catch (error) {
    console.error("❌ Disable 2FA error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تعطيل المصادقة الثنائية"
    });
  }
};