// ============================================
// ملف: src/routes/auth.routes.js (محدث)
// ============================================

const express = require("express");
const router = express.Router();

// ✅ استيراد موحد
const { authController } = require('../controllers');

// الـ middlewares
const auth = require("../middlewares/auth.middleware");
const rateLimiter = require("../middlewares/rateLimit.middleware");
const validate = require("../middlewares/validate.middleware");
const { registerSchema, loginSchema, changePasswordSchema } = require("../validators/auth.validator");

// ========== المسارات العامة ==========
router.post("/register", rateLimiter.authLimiter, validate(registerSchema), authController.register);
router.post("/register/complete", rateLimiter.authLimiter, validate(registerSchema), authController.registerComplete);
router.post("/login", rateLimiter.authLimiter, validate(loginSchema), authController.login);
router.post("/login/complete", rateLimiter.authLimiter, validate(loginSchema), authController.loginComplete);
router.post("/verify", rateLimiter.authLimiter, authController.verifyAccount);
router.post("/resend-verification", rateLimiter.authLimiter, authController.resendVerification);
router.post("/forgot-password", rateLimiter.strictLimiter, authController.forgotPassword);
router.post("/reset-password", rateLimiter.strictLimiter, authController.resetPassword);
router.post("/refresh", rateLimiter.authLimiter, authController.refreshToken);

// ========== المسارات المحمية ==========
router.post("/logout", auth, authController.logout);
router.get("/validate", auth, authController.validateToken);
router.post("/change-password", auth, validate(changePasswordSchema), authController.changePassword);
router.post("/revoke-all-sessions", auth, authController.revokeAllSessions);

module.exports = router;