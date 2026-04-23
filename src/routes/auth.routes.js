// ============================================
// ملف: src/routes/auth.routes.js
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
  forgotPasswordSchema,
  sendVerificationSchema,
  verifyPhoneSchema,
  verifyLoginOTPSchema,
  enableTwoFactorSchema,
  confirmTwoFactorSchema,
  disableTwoFactorSchema
} = require("../validators/auth.validator");

router.post(
  "/register",
  rateLimiter.authLimiter,
  validate(registerSchema),
  authController.register
);

router.post(
  "/login",
  rateLimiter.authLimiter,
  validate(loginSchema),
  authController.login
);

router.post(
  "/login/verify-otp",
  rateLimiter.authLimiter,
  validate(verifyLoginOTPSchema),
  authController.verifyLoginOTP
);

router.post(
  "/verify",
  rateLimiter.authLimiter,
  validate(verifyAccountSchema),
  authController.verifyAccount
);

router.post(
  "/resend-verification",
  rateLimiter.authLimiter,
  validate(resendVerificationSchema),
  authController.resendVerification
);

router.post(
  "/forgot-password",
  rateLimiter.strictLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  "/reset-password",
  rateLimiter.strictLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
);

router.post(
  "/refresh",
  rateLimiter.authLimiter,
  authController.refreshToken
);

router.post("/logout", auth, authController.logout);

router.get("/validate", auth, authController.validateToken);

router.post(
  "/change-password",
  auth,
  validate(changePasswordSchema),
  authController.changePassword
);

router.post("/revoke-all-sessions", auth, authController.revokeAllSessions);

router.post(
  "/send-verification",
  rateLimiter.strictLimiter,
  validate(sendVerificationSchema),
  authController.sendPhoneVerification
);

router.post(
  "/verify-phone",
  rateLimiter.authLimiter,
  validate(verifyPhoneSchema),
  authController.verifyPhone
);

router.post(
  "/enable-2fa",
  auth,
  validate(enableTwoFactorSchema),
  authController.enableTwoFactor
);

router.post(
  "/confirm-2fa",
  auth,
  validate(confirmTwoFactorSchema),
  authController.confirmTwoFactor
);

router.post(
  "/disable-2fa",
  auth,
  validate(disableTwoFactorSchema),
  authController.disableTwoFactor
);

module.exports = router;