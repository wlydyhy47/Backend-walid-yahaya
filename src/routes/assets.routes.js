// ============================================
// ملف: src/routes/assets.routes.js
// الوصف: مسارات الملفات الثابتة والصور
// ============================================

const express = require('express');
const router = express.Router();

const { assetsController } = require('../controllers');

/**
 * @swagger
 * tags:
 *   name: 📁 Assets
 *   description: الملفات الثابتة والصور الافتراضية
 */

/**
 * @swagger
 * /assets/images:
 *   get:
 *     summary: الحصول على قائمة الصور المتاحة
 *     tags: [📁 Assets]
 *     responses:
 *       200:
 *         description: قائمة الصور
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
 *                     images:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           url:
 *                             type: string
 *                           size:
 *                             type: integer
 *                           type:
 *                             type: string
 */
router.get('/images', assetsController.getImages);

/**
 * @swagger
 * /assets/icons:
 *   get:
 *     summary: الحصول على قائمة الأيقونات المتاحة
 *     tags: [📁 Assets]
 *     responses:
 *       200:
 *         description: قائمة الأيقونات
 */
router.get('/icons', assetsController.getIcons);

/**
 * @swagger
 * /assets/defaults:
 *   get:
 *     summary: الحصول على الصور الافتراضية
 *     tags: [📁 Assets]
 *     responses:
 *       200:
 *         description: الصور الافتراضية للمستخدمين والمتاجر
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
 *                     userAvatar:
 *                       type: string
 *                     storeLogo:
 *                       type: string
 *                     productImage:
 *                       type: string
 *                     coverImage:
 *                       type: string
 */
router.get('/defaults', assetsController.getDefaultImages);

module.exports = router;