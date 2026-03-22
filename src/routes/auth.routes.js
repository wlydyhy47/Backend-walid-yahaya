// ============================================
// ملف: src/routes/auth.routes.js (المصحح مع Validation)
// ============================================

const express = require("express");
const router = express.Router();

const { authController } = require('../controllers');

const auth = require("../middlewares/auth.middleware");
const rateLimiter = require("../middlewares/rateLimit.middleware");
const validate = require("../middlewares/validate.middleware");

const {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  resetPasswordSchema,
  resendVerificationSchema,
  verifyAccountSchema,
  forgotPasswordSchema
} = require("../validators/auth.validator");

// ========== المسارات العامة (موحدة) ==========

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: تسجيل مستخدم جديد
 */
router.post(
  "/register", 
  rateLimiter.authLimiter, 
  validate(registerSchema), 
  authController.register
);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: تسجيل الدخول
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
 */
router.post(
  "/verify", 
  rateLimiter.authLimiter, 
  validate(verifyAccountSchema), 
  authController.verifyAccount
);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    إعادة إرسال رمز التحقق
 */
router.post(
  "/resend-verification", 
  rateLimiter.authLimiter, 
  validate(resendVerificationSchema), 
  authController.resendVerification
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    طلب إعادة تعيين كلمة المرور
 */
router.post(
  "/forgot-password", 
  rateLimiter.strictLimiter, 
  validate(forgotPasswordSchema), 
  authController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    إعادة تعيين كلمة المرور باستخدام الرمز
 */
router.post(
  "/reset-password", 
  rateLimiter.strictLimiter, 
  validate(resetPasswordSchema), 
  authController.resetPassword
);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: تجديد التوكن
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
 */
router.post("/logout", auth, authController.logout);

/**
 * @route   GET /api/auth/validate
 * @desc    التحقق من صحة التوكن
 */
router.get("/validate", auth, authController.validateToken);

/**
 * @route   POST /api/auth/change-password
 * @desc    تغيير كلمة المرور للمستخدم الحالي
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
 */
router.post("/revoke-all-sessions", auth, authController.revokeAllSessions);

module.exports = router;