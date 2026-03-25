// ============================================
// ملف: src/routes/auth.routes.js
// الوصف: مسارات المصادقة والتوثيق المركزية
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

/**
 * @swagger
 * tags:
 *   name: 🔐 Authentication
 *   description: مسارات المصادقة وإدارة الحسابات
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: تسجيل مستخدم جديد
 *     tags: [🔐 Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - phone
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: أحمد محمد
 *               email:
 *                 type: string
 *                 format: email
 *                 example: ahmed@example.com
 *               phone:
 *                 type: string
 *                 example: +966501234567
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: Pass@123
 *               role:
 *                 type: string
 *                 enum: [client, vendor, driver]
 *                 default: client
 *     responses:
 *       201:
 *         description: تم التسجيل بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: تم التسجيل بنجاح. يرجى تفعيل حسابك عبر البريد الإلكتروني
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                     verificationCode:
 *                       type: string
 *       400:
 *         description: بيانات غير صحيحة أو البريد موجود مسبقاً
 *       429:
 *         description: محاولات كثيرة جداً
 */
router.post(
  "/register",
  rateLimiter.authLimiter,
  validate(registerSchema),
  authController.register
);


/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: تسجيل الدخول
 *     tags: [🔐 Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - password
 *             properties:
 *               phone:
 *                 type: string
 *                 description: رقم الهاتف (مطلوب)
 *                 example: +966501234567
 *               password:
 *                 type: string
 *                 format: password
 *                 description: كلمة المرور (مطلوب)
 *                 example: Pass@123
 *               deviceId:
 *                 type: string
 *                 description: معرف الجهاز للإشعارات (اختياري)
 *                 example: device_12345
 *     responses:
 *       200:
 *         description: تم تسجيل الدخول بنجاح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       example: eyJhbGciOiJIUzI1NiIs...
 *                     refreshToken:
 *                       type: string
 *                       example: eyJhbGciOiJIUzI1NiIs...
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         description: بيانات غير صحيحة
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "رقم الهاتف أو البريد الإلكتروني وكلمة المرور مطلوبة"
 *       401:
 *         description: بيانات الدخول غير صحيحة
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "بيانات الدخول غير صحيحة"
 *       403:
 *         description: الحساب غير مفعل أو مقفل
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "الحساب غير مفعل"
 *       429:
 *         description: محاولات كثيرة جداً
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "محاولات تسجيل دخول كثيرة جداً، الرجاء المحاولة بعد ساعة"
 *               code: "RATE_LIMIT_EXCEEDED"
 */
router.post(
  "/login",
  rateLimiter.authLimiter,
  validate(loginSchema),
  authController.login
);


/**
 * @swagger
 * /auth/verify:
 *   post:
 *     summary: تفعيل الحساب
 *     tags: [🔐 Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               code:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: تم تفعيل الحساب بنجاح
 *       400:
 *         description: رمز التفعيل غير صحيح
 */
router.post(
  "/verify",
  rateLimiter.authLimiter,
  validate(verifyAccountSchema),
  authController.verifyAccount
);

/**
 * @swagger
 * /auth/resend-verification:
 *   post:
 *     summary: إعادة إرسال رمز التفعيل
 *     tags: [🔐 Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: تم إرسال رمز التفعيل
 */
router.post(
  "/resend-verification",
  rateLimiter.authLimiter,
  validate(resendVerificationSchema),
  authController.resendVerification
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: طلب إعادة تعيين كلمة المرور
 *     tags: [🔐 Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: تم إرسال رابط إعادة التعيين
 */
router.post(
  "/forgot-password",
  rateLimiter.strictLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: إعادة تعيين كلمة المرور
 *     tags: [🔐 Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: تم تغيير كلمة المرور بنجاح
 */
router.post(
  "/reset-password",
  rateLimiter.strictLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: تحديث رمز الوصول
 *     tags: [🔐 Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم تحديث الرمز
 */
router.post(
  "/refresh",
  rateLimiter.authLimiter,
  authController.refreshToken
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: تسجيل الخروج
 *     tags: [🔐 Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تم تسجيل الخروج بنجاح
 */
router.post("/logout", auth, authController.logout);

/**
 * @swagger
 * /auth/validate:
 *   get:
 *     summary: التحقق من صحة الرمز
 *     tags: [🔐 Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: الرمز صالح
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                     exp:
 *                       type: integer
 */
router.get("/validate", auth, authController.validateToken);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: تغيير كلمة المرور (للمستخدم المسجل)
 *     tags: [🔐 Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: تم تغيير كلمة المرور
 *       401:
 *         description: كلمة المرور الحالية غير صحيحة
 */
router.post(
  "/change-password",
  auth,
  validate(changePasswordSchema),
  authController.changePassword
);

/**
 * @swagger
 * /auth/revoke-all-sessions:
 *   post:
 *     summary: إلغاء جميع الجلسات النشطة
 *     tags: [🔐 Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: تم إلغاء جميع الجلسات
 */
router.post("/revoke-all-sessions", auth, authController.revokeAllSessions);

module.exports = router;