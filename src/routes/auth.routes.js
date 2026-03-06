const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const { rateLimit } = require("express-rate-limit");
const validate = require("../middlewares/validate.middleware");
const { registerSchema, loginSchema,changePasswordSchema } = require("../validators/auth.validator");
const rateLimiter = require("../middlewares/rateLimit.middleware");
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
router.post("/register",  rateLimiter.authLimiter, validate(registerSchema), authController.register);

/**
 * @route   POST /api/auth/register/complete
 * @desc    تسجيل مستخدم جديد (متقدم)
 * @access  Public
 */
router.post("/register/complete", rateLimiter.authLimiter, validate(registerSchema), authController.registerComplete);

/**
 * @route   POST /api/auth/login
 * @desc    تسجيل الدخول (بسيط)
 * @access  Public
 */
router.post("/login", rateLimiter.authLimiter, validate(loginSchema), authController.login);

/**
 * @route   POST /api/auth/login/complete
 * @desc    تسجيل الدخول (متقدم)
 * @access  Public
 */
router.post("/login/complete",  rateLimiter.authLimiter, validate(loginSchema), authController.loginComplete);

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
router.post("/forgot-password", rateLimiter.strictLimiter, authController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    إعادة تعيين كلمة المرور
 * @access  Public
 */
router.post("/reset-password", rateLimiter.strictLimiter, authController.resetPassword);

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
router.post("/change-password", auth, validate(changePasswordSchema), authController.changePassword);

/**
 * @route   POST /api/auth/revoke-all-sessions
 * @desc    إبطال جميع جلسات المستخدم
 * @access  Private
 */
router.post("/revoke-all-sessions", auth, authController.revokeAllSessions);

module.exports = router;