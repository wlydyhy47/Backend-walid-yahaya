// ============================================
// ملف: src/routes/address.routes.js
// الوصف: مسارات إدارة العناوين
// الإصدار: 2.0
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
 *           example: 60d21b4667d0d8992e610c90
 *         userId:
 *           type: string
 *           example: 60d21b4667d0d8992e610c89
 *         label:
 *           type: string
 *           enum: [home, work, other]
 *           example: home
 *         addressLine:
 *           type: string
 *           example: شارع الملك فهد، الرياض
 *         city:
 *           type: string
 *           example: الرياض
 *         area:
 *           type: string
 *           example: العليا
 *         building:
 *           type: string
 *           example: برج المملكة
 *         floor:
 *           type: string
 *           example: 5
 *         apartment:
 *           type: string
 *           example: 502
 *         instructions:
 *           type: string
 *           example: البوابة اليمنى
 *         latitude:
 *           type: number
 *           example: 24.7136
 *         longitude:
 *           type: number
 *           example: 46.6753
 *         isDefault:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     CreateAddressInput:
 *       type: object
 *       required:
 *         - addressLine
 *         - latitude
 *         - longitude
 *       properties:
 *         label:
 *           type: string
 *           enum: [home, work, other]
 *           default: home
 *         addressLine:
 *           type: string
 *           minLength: 5
 *           maxLength: 200
 *         city:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         area:
 *           type: string
 *           maxLength: 100
 *         building:
 *           type: string
 *           maxLength: 50
 *         floor:
 *           type: string
 *           maxLength: 10
 *         apartment:
 *           type: string
 *           maxLength: 10
 *         instructions:
 *           type: string
 *           maxLength: 200
 *         latitude:
 *           type: number
 *           minimum: -90
 *           maximum: 90
 *         longitude:
 *           type: number
 *           minimum: -180
 *           maximum: 180
 *         isDefault:
 *           type: boolean
 *           default: false
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
 *             $ref: '#/components/schemas/CreateAddressInput'
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
 *             $ref: '#/components/schemas/UpdateAddressInput'
 *     responses:
 *       200:
 *         description: تم تحديث العنوان
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Address'
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