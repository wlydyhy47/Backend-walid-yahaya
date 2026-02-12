// /opt/render/project/src/src/routes/auth.routes.js

const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const { rateLimit } = require("express-rate-limit");

// 🛡️ Rate limiting لطرق المصادقة
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 10, // 10 محاولات كحد أقصى
  message: {
    success: false,
    message: "محاولات كثيرة جداً، الرجاء المحاولة بعد 15 دقيقة"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================== المسارات العامة (لا تحتاج مصادقة) ====================

/**
 * @route   POST /api/auth/register
 * @desc    تسجيل مستخدم جديد (بسيط)
 * @access  Public
 */
router.post("/register", authLimiter, authController.register);

/**
 * @route   POST /api/auth/register/complete
 * @desc    تسجيل مستخدم جديد (متقدم)
 * @access  Public
 */
router.post("/register/complete", authLimiter, authController.registerComplete);

/**
 * @route   POST /api/auth/login
 * @desc    تسجيل الدخول (بسيط)
 * @access  Public
 */
router.post("/login", authLimiter, authController.login);

/**
 * @route   POST /api/auth/login/complete
 * @desc    تسجيل الدخول (متقدم)
 * @access  Public
 */
router.post("/login/complete", authLimiter, authController.loginComplete);

/**
 * @route   POST /api/auth/verify
 * @desc    تأكيد الحساب
 * @access  Public
 */
router.post("/verify", authLimiter, authController.verifyAccount);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    إعادة إرسال كود التحقق
 * @access  Public
 */
router.post("/resend-verification", authLimiter, authController.resendVerification);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    نسيت كلمة المرور
 * @access  Public
 */
router.post("/forgot-password", authLimiter, authController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    إعادة تعيين كلمة المرور
 * @access  Public
 */
router.post("/reset-password", authLimiter, authController.resetPassword);

/**
 * @route   POST /api/auth/refresh
 * @desc    تجديد التوكن
 * @access  Public (يحتاج refresh token)
 */
router.post("/refresh", authLimiter, authController.refreshToken);

// ==================== المسارات المحمية (تحتاج مصادقة) ====================

/**
 * @route   POST /api/auth/logout
 * @desc    تسجيل الخروج
 * @access  Private
 */
router.post("/logout", auth, authController.logout);

/**
 * @route   GET /api/auth/validate
 * @desc    التحقق من صلاحية التوكن
 * @access  Private
 */
router.get("/validate", auth, authController.validateToken);

/**
 * @route   POST /api/auth/change-password
 * @desc    تغيير كلمة المرور
 * @access  Private
 */
router.post("/change-password", auth, authController.changePassword);

/**
 * @route   POST /api/auth/revoke-all-sessions
 * @desc    إبطال جميع جلسات المستخدم
 * @access  Private
 */
router.post("/revoke-all-sessions", auth, authController.revokeAllSessions);

module.exports = router;