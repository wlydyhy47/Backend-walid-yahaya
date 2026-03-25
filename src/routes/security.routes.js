// ============================================
// ملف: src/routes/security.routes.js
// الوصف: مسارات الأمان والفحوصات
// الإصدار: 2.0
// ============================================

const express = require('express');
const router = express.Router();

const { securityController } = require('../controllers');
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');
const rateLimiter = require('../middlewares/rateLimit.middleware');

/**
 * @swagger
 * tags:
 *   name: 🔒 Security
 *   description: مسارات الأمان والفحوصات
 */

/**
 * @swagger
 * /security/check-password:
 *   post:
 *     summary: فحص قوة كلمة المرور
 *     tags: [🔒 Security]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 example: MyStr0ngP@ssw0rd
 *     responses:
 *       200:
 *         description: نتيجة فحص كلمة المرور
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
 *                     strength:
 *                       type: string
 *                       enum: [weak, fair, good, strong, very_strong]
 *                     score:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 4
 *                     feedback:
 *                       type: object
 *                       properties:
 *                         warning:
 *                           type: string
 *                         suggestions:
 *                           type: array
 *                           items:
 *                             type: string
 *       400:
 *         description: كلمة المرور مطلوبة
 */
router.post('/check-password', rateLimiter.apiLimiter, securityController.checkPassword);

/**
 * @swagger
 * /security/check-email:
 *   post:
 *     summary: فحص صحة البريد الإلكتروني
 *     tags: [🔒 Security]
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
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: نتيجة فحص البريد الإلكتروني
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
 *                     isValid:
 *                       type: boolean
 *                     isDisposable:
 *                       type: boolean
 *                     domain:
 *                       type: string
 *                     hasMx:
 *                       type: boolean
 *                     suggestions:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: البريد الإلكتروني مطلوب
 */
router.post('/check-email', rateLimiter.apiLimiter, securityController.checkEmail);

/**
 * @swagger
 * /security/headers:
 *   get:
 *     summary: الحصول على رؤوس الأمان الحالية (للمشرف فقط)
 *     tags: [🔒 Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: رؤوس الأمان
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
 *                     current:
 *                       type: object
 *                     status:
 *                       type: string
 *                     recommendations:
 *                       type: array
 *                       items:
 *                         type: string
 *       403:
 *         description: غير مصرح - يتطلب صلاحيات المشرف
 */
router.get('/headers', auth, role('admin'), securityController.getSecurityHeaders);

module.exports = router;