// ============================================
// ملف: src/routes/address.routes.js
// الوصف: مسارات إدارة العناوين
// ============================================

const express = require("express");
const router = express.Router();

const { addressController } = require('../controllers');
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");

const {
  createAddressSchema,
  updateAddressSchema
} = require('../validators/address.validator');

/**
 * @swagger
 * tags:
 *   name: 📍 Addresses
 *   description: إدارة عناوين المستخدمين
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Address:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         userId:
 *           type: string
 *         title:
 *           type: string
 *           example: المنزل
 *         address:
 *           type: string
 *           example: شارع الملك فهد، الرياض
 *         latitude:
 *           type: number
 *           example: 24.7136
 *         longitude:
 *           type: number
 *           example: 46.6753
 *         apartment:
 *           type: string
 *           example: شقة 5
 *         floor:
 *           type: string
 *           example: الطابق 3
 *         landmark:
 *           type: string
 *           example: بجوار مسجد الملك
 *         isDefault:
 *           type: boolean
 *           default: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// جميع المسارات تحتاج توثيق
router.use(auth);

/**
 * @swagger
 * /addresses:
 *   post:
 *     summary: إضافة عنوان جديد
 *     tags: [📍 Addresses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - address
 *               - latitude
 *               - longitude
 *             properties:
 *               title:
 *                 type: string
 *                 example: المنزل
 *               address:
 *                 type: string
 *                 example: شارع الملك فهد، الرياض
 *               latitude:
 *                 type: number
 *                 example: 24.7136
 *               longitude:
 *                 type: number
 *                 example: 46.6753
 *               apartment:
 *                 type: string
 *                 example: شقة 5
 *               floor:
 *                 type: string
 *                 example: الطابق 3
 *               landmark:
 *                 type: string
 *                 example: بجوار مسجد الملك
 *               isDefault:
 *                 type: boolean
 *                 default: false
 *               instructions:
 *                 type: string
 *                 example: البوابة اليمنى
 *     responses:
 *       201:
 *         description: تم إضافة العنوان
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Address'
 *       400:
 *         description: بيانات غير صحيحة
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post("/", validate(createAddressSchema), addressController.createAddress);

/**
 * @swagger
 * /addresses/me:
 *   get:
 *     summary: الحصول على جميع عناويني
 *     tags: [📍 Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: قائمة العناوين
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Address'
 */
router.get("/me", addressController.getMyAddresses);

/**
 * @swagger
 * /addresses/{id}:
 *   put:
 *     summary: تحديث عنوان
 *     tags: [📍 Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               address:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               apartment:
 *                 type: string
 *               floor:
 *                 type: string
 *               landmark:
 *                 type: string
 *               instructions:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم تحديث العنوان
 *       403:
 *         description: ليس لديك صلاحية تعديل هذا العنوان
 *       404:
 *         description: العنوان غير موجود
 */
router.put("/:id", validate(updateAddressSchema), addressController.updateAddress);

/**
 * @swagger
 * /addresses/{id}:
 *   delete:
 *     summary: حذف عنوان
 *     tags: [📍 Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم حذف العنوان
 *       403:
 *         description: ليس لديك صلاحية حذف هذا العنوان
 *       404:
 *         description: العنوان غير موجود
 */
router.delete("/:id", addressController.deleteAddress);

/**
 * @swagger
 * /addresses/{id}:
 *   get:
 *     summary: الحصول على عنوان محدد
 *     tags: [📍 Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تفاصيل العنوان
 *       404:
 *         description: العنوان غير موجود
 */
router.get("/:id", addressController.getAddressById);

/**
 * @swagger
 * /addresses/{id}/set-default:
 *   put:
 *     summary: تعيين عنوان كافتراضي
 *     tags: [📍 Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم تعيين العنوان كافتراضي
 *       404:
 *         description: العنوان غير موجود
 */
router.put("/:id/set-default", addressController.setDefaultAddress);

module.exports = router;