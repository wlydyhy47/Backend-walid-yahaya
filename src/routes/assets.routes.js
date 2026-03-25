// ============================================
// ملف: src/routes/assets.routes.js
// الوصف: مسارات الملفات الثابتة والصور
// الإصدار: 2.0
// ============================================

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload');
const { assetsController } = require('../controllers');
const role = require('../middlewares/role.middleware');
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
 *                     total:
 *                       type: integer
 *                     categories:
 *                       type: array
 *                     images:
 *                       type: object
 *                     all:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           filename:
 *                             type: string
 *                           url:
 *                             type: string
 *                           thumbnail:
 *                             type: string
 *                           fullUrl:
 *                             type: string
 *                           type:
 *                             type: string
 *                           size:
 *                             type: integer
 *                           category:
 *                             type: string
 */
router.get('/images', assetsController.getImages);

/**
 * @swagger
 * /assets/images/{category}:
 *   get:
 *     summary: الحصول على صور حسب الفئة
 *     tags: [📁 Assets]
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [stores, items, users, covers, icons, defaults]
 *     responses:
 *       200:
 *         description: قائمة الصور حسب الفئة
 */
router.get('/images/:category', assetsController.getImagesByCategory);

/**
 * @swagger
 * /assets/icons:
 *   get:
 *     summary: الحصول على قائمة الأيقونات المتاحة
 *     tags: [📁 Assets]
 *     responses:
 *       200:
 *         description: قائمة الأيقونات
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
 *                     total:
 *                       type: integer
 *                     icons:
 *                       type: array
 *                     favicon:
 *                       type: object
 *                     appleTouch:
 *                       type: object
 *                     android:
 *                       type: array
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
 *                     avatar:
 *                       type: object
 *                     store:
 *                       type: object
 *                     item:
 *                       type: object
 *                     cover:
 *                       type: object
 *                     category:
 *                       type: object
 *                     logo:
 *                       type: object
 *                     favicon:
 *                       type: object
 */
router.get('/defaults', assetsController.getDefaultImages);

/**
 * @swagger
 * /assets/defaults/{type}:
 *   get:
 *     summary: الحصول على صورة افتراضية محددة
 *     tags: [📁 Assets]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [avatar, store, item, cover, logo, favicon]
 *     responses:
 *       200:
 *         description: الصورة الافتراضية المطلوبة
 */
router.get('/defaults/:type', assetsController.getDefaultImageByType);

/**
 * @swagger
 * /assets/upload:
 *   post:
 *     summary: رفع صورة (للمستخدمين)
 *     tags: [📁 Assets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               type:
 *                 type: string
 *                 enum: [avatar, cover, item, store]
 *     responses:
 *       200:
 *         description: تم رفع الصورة
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
 *                     url:
 *                       type: string
 *                     publicId:
 *                       type: string
 *                     filename:
 *                       type: string
 *                     size:
 *                       type: integer
 *                     mimetype:
 *                       type: string
 *                     optimized:
 *                       type: object
 */
router.post('/upload', auth, upload('assets', ['image']).single('image'), assetsController.uploadImage);

/**
 * @swagger
 * /assets/{publicId}:
 *   delete:
 *     summary: حذف صورة
 *     tags: [📁 Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: publicId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم حذف الصورة
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.delete('/:publicId', auth, assetsController.deleteImage);

/**
 * @swagger
 * /assets/info/{publicId}:
 *   get:
 *     summary: الحصول على معلومات ملف
 *     tags: [📁 Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: publicId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: معلومات الملف
 */
router.get('/info/:publicId', auth, role('admin'), assetsController.getFileInfo);

module.exports = router;