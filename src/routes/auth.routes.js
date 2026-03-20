// ============================================
// ملف: src/routes/auth.routes.js (النسخة النهائية الموحدة - تم إصلاح الاستيراد)
// الوصف: مسارات المصادقة - رابط واحد لكل عملية
// ============================================

const express = require("express");
const router = express.Router();

// ✅ ✅ ✅ التصحيح: استيراد authController من المجلد الموحد controllers ✅ ✅ ✅
const { authController } = require('../controllers');

// الـ middlewares
const auth = require("../middlewares/auth.middleware");
const rateLimiter = require("../middlewares/rateLimit.middleware");
const validate = require("../middlewares/validate.middleware");
const { registerSchema, loginSchema, changePasswordSchema } = require("../validators/auth.validator");

// ========== المسارات العامة (موحدة) ==========

/**
 * @route   POST /api/auth/register
 * @desc    تسجيل مستخدم جديد (يدعم البيانات البسيطة والكاملة)
 * @access  Public
 */
router.post(
  "/register", 
  rateLimiter.authLimiter, 
  validate(registerSchema), 
  authController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    تسجيل الدخول (يدعم الهاتف أو البريد الإلكتروني)
 * @access  Public
 */
router.post(
  "/login", 
  rateLimiter.authLimiter, 
  validate(loginSchema), 
  authController.login
);

/**
 * @route   POST /api/auth/verify
 * @desc    تفعيل الحساب باستخدام رمز التحقق
 * @access  Public
 */
router.post(
  "/verify", 
  rateLimiter.authLimiter, 
  authController.verifyAccount
);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    إعادة إرسال رمز التحقق
 * @access  Public
 */
router.post(
  "/resend-verification", 
  rateLimiter.authLimiter, 
  authController.resendVerification
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    طلب إعادة تعيين كلمة المرور
 * @access  Public
 */
router.post(
  "/forgot-password", 
  rateLimiter.strictLimiter, 
  authController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    إعادة تعيين كلمة المرور باستخدام الرمز
 * @access  Public
 */
router.post(
  "/reset-password", 
  rateLimiter.strictLimiter, 
  authController.resetPassword
);

/**
 * @route   POST /api/auth/refresh
 * @desc    تجديد التوكن باستخدام Refresh Token
 * @access  Public
 */
router.post(
  "/refresh", 
  rateLimiter.authLimiter, 
  authController.refreshToken
);

// ========== المسارات المحمية (تتطلب توكن) ==========

/**
 * @route   POST /api/auth/logout
 * @desc    تسجيل الخروج وإبطال التوكنات
 * @access  Private
 */
router.post(
  "/logout", 
  auth, 
  authController.logout
);

/**
 * @route   GET /api/auth/validate
 * @desc    التحقق من صحة التوكن
 * @access  Private
 */
router.get(
  "/validate", 
  auth, 
  authController.validateToken
);

/**
 * @route   POST /api/auth/change-password
 * @desc    تغيير كلمة المرور للمستخدم الحالي
 * @access  Private
 */
router.post(
  "/change-password", 
  auth, 
  validate(changePasswordSchema), 
  authController.changePassword
);

/**
 * @route   POST /api/auth/revoke-all-sessions
 * @desc    إبطال جميع جلسات المستخدم
 * @access  Private
 */
router.post(
  "/revoke-all-sessions", 
  auth, 
  authController.revokeAllSessions
);

module.exports = router;