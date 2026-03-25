// ============================================
// ملف: src/routes/auth.routes.js
// الوصف: مسارات المصادقة والتوثيق المركزية
// الإصدار: 3.0
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
 *               - phone
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: أحمد محمد
 *               phone:
 *                 type: string
 *                 description: رقم الهاتف (يجب أن يكون فريداً)
 *                 example: +966501234567
 *               email:
 *                 type: string
 *                 format: email
 *                 description: البريد الإلكتروني (اختياري)
 *                 example: ahmed@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: Pass@123
 *               role:
 *                 type: string
 *                 enum: [client, vendor, driver]
 *                 default: client
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *               city:
 *                 type: string
 *               preferences:
 *                 type: object
 *                 properties:
 *                   language:
 *                     type: string
 *                     enum: [ar, fr, en]
 *                     default: ar
 *                   currency:
 *                     type: string
 *                     enum: [XOF, EUR, USD]
 *                     default: XOF
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
 *                   example: تم التسجيل بنجاح. يرجى تفعيل حسابك
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     expiresIn:
 *                       type: string
 *                     verificationCode:
 *                       type: string
 *       400:
 *         description: بيانات غير صحيحة أو رقم الهاتف موجود مسبقاً
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
 *               - password
 *             properties:
 *               phone:
 *                 type: string
 *                 description: رقم الهاتف (مطلوب إذا لم يكن البريد موجوداً)
 *                 example: +966501234567
 *               email:
 *                 type: string
 *                 format: email
 *                 description: البريد الإلكتروني (اختياري، بديل عن الهاتف)
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 description: كلمة المرور (مطلوبة)
 *                 minLength: 6
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
 *                     expiresIn:
 *                       type: string
 *                       example: 7d
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     verificationNeeded:
 *                       type: boolean
 *       400:
 *         description: رقم الهاتف أو البريد الإلكتروني وكلمة المرور مطلوبة
 *       401:
 *         description: بيانات الدخول غير صحيحة
 *       403:
 *         description: الحساب غير مفعل أو مقفل
 *       429:
 *         description: محاولات كثيرة جداً
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
 *               - phone
 *               - code
 *             properties:
 *               phone:
 *                 type: string
 *                 example: +966501234567
 *               code:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *                 example: ABC123
 *     responses:
 *       200:
 *         description: تم تفعيل الحساب بنجاح
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
 *                       $ref: '#/components/schemas/User'
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *       400:
 *         description: رمز التفعيل غير صحيح أو منتهي الصلاحية
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
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 example: +966501234567
 *     responses:
 *       200:
 *         description: تم إرسال رمز التفعيل
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     phone:
 *                       type: string
 *                     expiresIn:
 *                       type: string
 *       404:
 *         description: المستخدم غير موجود أو تم تفعيل الحساب مسبقاً
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
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 example: +966501234567
 *     responses:
 *       200:
 *         description: تم إرسال تعليمات إعادة التعيين
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     phone:
 *                       type: string
 *                     expiresIn:
 *                       type: string
 *       404:
 *         description: المستخدم غير موجود
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
 *               - phone
 *               - token
 *               - newPassword
 *             properties:
 *               phone:
 *                 type: string
 *                 example: +966501234567
 *               token:
 *                 type: string
 *                 example: abc123def456
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: NewPass@123
 *     responses:
 *       200:
 *         description: تم إعادة تعيين كلمة المرور بنجاح
 *       400:
 *         description: رمز إعادة التعيين غير صالح أو منتهي الصلاحية
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
 *                 example: eyJhbGciOiJIUzI1NiIs...
 *     responses:
 *       200:
 *         description: تم تحديث الرمز
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
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     expiresIn:
 *                       type: string
 *       401:
 *         description: Refresh token غير صالح أو منتهي الصلاحية
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم تسجيل الخروج بنجاح
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
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
 *                       $ref: '#/components/schemas/User'
 *                     tokenInfo:
 *                       type: object
 *                       properties:
 *                         expiresAt:
 *                           type: string
 *                           format: date-time
 *                         issuedAt:
 *                           type: string
 *                           format: date-time
 *       401:
 *         description: الرمز غير صالح أو منتهي الصلاحية
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
 *                 example: OldPass@123
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: NewPass@123
 *     responses:
 *       200:
 *         description: تم تغيير كلمة المرور
 *       400:
 *         description: كلمة المرور الحالية غير صحيحة
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
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
 *                     revokedCount:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post("/revoke-all-sessions", auth, authController.revokeAllSessions);

module.exports = router;