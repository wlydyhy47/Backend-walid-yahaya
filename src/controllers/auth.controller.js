const User = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const cache = require("../utils/cache.util");

// Register
exports.register = async (req, res) => {
  const { name, phone, password } = req.body;

  const exists = await User.findOne({ phone });
  if (exists) {
    return res.status(400).json({ message: "User already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    phone,
    password: hashedPassword,
  });

  res.status(201).json({ message: "User registered" });
};

// Login
exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // 1. ابحث عن المستخدم مع كلمة المرور (مهم: select('+password'))
    const user = await User.findOne({ phone }).select('+password +isActive +isVerified');
    
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: "رقم الهاتف أو كلمة المرور غير صحيحة" 
      });
    }

    // 2. تحقق من حالة الحساب
    if (!user.isActive) {
      return res.status(403).json({ 
        success: false,
        message: "الحساب معطل، الرجاء التواصل مع الدعم" 
      });
    }

    // 3. تحقق من كلمة المرور
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: "رقم الهاتف أو كلمة المرور غير صحيحة" 
      });
    }

    // 4. أنشئ التوكن
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role,
        phone: user.phone 
      },
      process.env.JWT_SECRET || 'fallback-secret-key-change-in-production',
      { expiresIn: "7d" }
    );

    // 5. سجل نشاط الدخول
    await user.logActivity('login', {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // 6. تحديث آخر دخول
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // 7. أعد الرد (بدون كلمة المرور)
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({ 
      success: true,
      token,
      user: userResponse,
      message: "تم تسجيل الدخول بنجاح"
    });

  } catch (error) {
    console.error('Login error:', error);
    
    res.status(500).json({ 
      success: false,
      message: "حدث خطأ أثناء تسجيل الدخول",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


/**
 * 🔐 تسجيل مستخدم جديد متقدم
 * POST /api/auth/register/complete
 */
exports.registerComplete = async (req, res) => {
  try {
    const { name, phone, password, email, role = "client", ...additionalData } = req.body;

    // التحقق من البيانات
    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, phone, and password are required",
      });
    }

    // التحقق من وجود المستخدم
    const exists = await User.findOne({ phone });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // تجهيز بيانات المستخدم
    const userData = {
      name,
      phone,
      password: await bcrypt.hash(password, 10),
      email,
      role,
      isVerified: false,
      stats: {
        joinedDate: new Date(),
      },
      preferences: {
        notifications: {
          email: true,
          sms: true,
          push: true,
          orderUpdates: true,
          promotions: true,
        },
        language: "ar",
        currency: "XOF",
        theme: "light",
      },
    };

    // إضافة البيانات الإضافية إذا كانت موجودة
    if (additionalData.dateOfBirth) {
      userData.dateOfBirth = new Date(additionalData.dateOfBirth);
    }

    if (additionalData.gender) {
      userData.gender = additionalData.gender;
    }

    if (additionalData.city) {
      userData.city = additionalData.city;
    }

    // إنشاء المستخدم
    const user = await User.create(userData);

    // إنشاء verification code
    const verificationCode = crypto.randomBytes(3).toString("hex").toUpperCase();
    user.verificationCode = verificationCode;
    user.verificationCodeExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 ساعة
    await user.save();

    // تسجيل النشاط
    await user.logActivity("registered", {
      method: "email",
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });
    // إنشاء token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // TODO: إرسال verification code عبر SMS أو Email

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
        verificationCode, // فقط للتطوير، إزالة في الإنتاج
        nextStep: "verify_account",
      },
    });
  } catch (error) {
    console.error("❌ Registration error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      body: req.body
    });

    let statusCode = 500;
    let message = "Registration failed";

    if (error.name === 'ValidationError') {
      statusCode = 400;
      const errors = Object.values(error.errors).map(err => err.message);
      message = `Validation failed: ${errors.join(', ')}`;
    } else if (error.code === 11000) {
      statusCode = 400;
      const field = error.message.includes('email') ? 'Email' : 'Phone';
      message = `${field} already exists`;
    } else if (error.message.includes('next is not a function')) {
      message = "Server configuration error - please contact support";
    }

    res.status(statusCode).json({
      success: false,
      message: message,
      metadata: {
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && {
          error: error.message,
          errorType: error.name
        })
      }
    });
  }
};

/**
 * 📧 تأكيد الحساب
 * POST /api/auth/verify
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
        message: "Invalid or expired verification code",
      });
    }

    // تحديث حالة المستخدم
    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    // تسجيل النشاط
    await user.logActivity("account_verified", {
      method: "code",
      ip: req.ip,
    }, req);

    // إنشاء token جديد
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
    console.error("❌ Verification error:", error.message);
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
  try {
    const { phone } = req.body;

    const user = await User.findOne({ phone, isVerified: false });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found or already verified",
      });
    }

    // إنشاء كود جديد
    const verificationCode = crypto.randomBytes(3).toString("hex").toUpperCase();
    user.verificationCode = verificationCode;
    user.verificationCodeExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    // TODO: إرسال SMS أو Email

    res.json({
      success: true,
      message: "Verification code sent successfully",
      data: {
        phone: user.phone,
        verificationCode, // للتطوير فقط
        expiresIn: "24 hours",
      },
    });
  } catch (error) {
    console.error("❌ Resend verification error:", error.message);
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
  try {
    const { phone } = req.body;

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // إنشاء reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 دقائق
    await user.save();

    // TODO: إرسال SMS مع الرابط

    res.json({
      success: true,
      message: "Password reset instructions sent",
      data: {
        phone: user.phone,
        resetToken, // للتطوير فقط
        expiresIn: "10 minutes",
      },
    });
  } catch (error) {
    console.error("❌ Forgot password error:", error.message);
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
  try {
    const { phone, resetToken, newPassword } = req.body;

    // تشفير token للبحث
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

    // تحديث كلمة المرور
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // تسجيل النشاط
    await user.logActivity("password_reset", {
      method: "reset_token",
      ip: req.ip,
    }, req);

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("❌ Reset password error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to reset password",
    });
  }
};

/**
 * 🔐 تسجيل الدخول المتقدم
 * POST /api/auth/login/complete
 */
exports.loginComplete = async (req, res) => {
  try {
    const { phone, password } = req.body;

    const user = await User.findOne({ phone }).select("+password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // التحقق من كلمة المرور
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // التحقق من حالة الحساب
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    // تحديث آخر تسجيل دخول
    user.lastLogin = new Date();
    user.isOnline = true;
    await user.save();

    // تسجيل النشاط
    await user.logActivity("login", {
      method: "password",
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    }, req);

    // إنشاء token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    // إعداد بيانات المستخدم للرد
    const userResponse = {
      id: user._id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      image: user.image,
      isVerified: user.isVerified,
      stats: user.stats,
      preferences: user.preferences,
      lastLogin: user.lastLogin,
    };

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: userResponse,
        token,
        expiresIn: "30 days",
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error.message);
    res.status(500).json({
      success: false,
      message: "Login failed",
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

    const user = await User.findById(userId);
    if (user) {
      user.isOnline = false;
      user.lastActivity = new Date();
      await user.save();

      // تسجيل النشاط
      await user.logActivity("logout", {
        ip: req.ip,
      }, req);
    }

    // إبطال token (في حالة استخدام blacklist)
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      cache.set(`token:blacklist:${token}`, true, 3600); // ساعة واحدة
    }

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("❌ Logout error:", error.message);
    res.status(500).json({
      success: false,
      message: "Logout failed",
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
        message: "No token provided",
      });
    }

    // التحقق من blacklist
    const isBlacklisted = cache.get(`token:blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: "Token is invalid",
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
        message: "User not found",
      });
    }

    // التحقق من حالة الحساب
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    res.json({
      success: true,
      message: "Token is valid",
      data: {
        user,
        tokenInfo: {
          expiresAt: new Date(decoded.exp * 1000),
          issuedAt: new Date(decoded.iat * 1000),
          role: decoded.role,
        },
      },
    });
  } catch (error) {
    console.error("❌ Token validation error:", error.message);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }

    res.status(500).json({
      success: false,
      message: "Token validation failed",
    });
  }
};

// ... الكود الحالي ...

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
      user = await User.findOne({ phone }).select("+password");
    }
    // ثم محاولة الدخول بالبريد الإلكتروني
    else if (email) {
      user = await User.findOne({ email }).select("+password");
    }
    else {
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

    // التحقق من تفعيل الحساب
    if (!user.isVerified && process.env.REQUIRE_VERIFICATION === 'true') {
      return res.status(403).json({
        success: false,
        message: "يرجى تفعيل حسابك أولاً",
        requiresVerification: true,
        userId: user._id
      });
    }

    // تحديث آخر تسجيل دخول
    user.lastLogin = new Date();
    user.isOnline = true;
    await user.save();

    // تسجيل النشاط
    await user.logActivity("login", {
      method: "password",
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    }, req);

    // إنشاء token
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        name: user.name,
        phone: user.phone
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
    );

    // إعداد بيانات المستخدم للرد
    const userResponse = {
      id: user._id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      image: user.image,
      isVerified: user.isVerified,
      stats: user.stats,
      preferences: user.preferences,
      lastLogin: user.lastLogin,
    };

    res.json({
      success: true,
      message: "تم تسجيل الدخول بنجاح",
      data: {
        user: userResponse,
        token,
        expiresIn: process.env.JWT_EXPIRES_IN || "30 days",
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error.message);
    res.status(500).json({
      success: false,
      message: "فشل تسجيل الدخول",
    });
  }
};
