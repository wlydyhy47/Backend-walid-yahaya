// ============================================
// ملف: src/routes/user.routes.js
// الوصف: مسارات إدارة المستخدمين (للمشرف فقط)
// ============================================

const express = require("express");
const router = express.Router();

const { userController } = require('../controllers');
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const PaginationUtils = require('../utils/pagination.util');

/**
 * @swagger
 * tags:
 *   name: 👥 Users
 *   description: إدارة المستخدمين (للمشرف فقط)
 */

// ========== جميع المسارات تحتاج توثيق ودور Admin ==========
router.use(auth);
router.use(role("admin"));

/**
 * @swagger
 * /users:
 *   get:
 *     summary: قائمة المستخدمين
 *     tags: [👥 Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [client, vendor, driver, admin]
 *       - in: query
 *         name: isVerified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: بحث بالاسم أو البريد أو رقم الهاتف
 *     responses:
 *       200:
 *         description: قائمة المستخدمين
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
 *                     users:
 *                       type: array
 *                     pagination:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: غير مصرح - يتطلب صلاحيات المشرف
 */
router.get("/", PaginationUtils.validatePaginationParams, userController.getUsers);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: تفاصيل مستخدم محدد
 *     tags: [👥 Users]
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
 *         description: تفاصيل المستخدم
 *       404:
 *         description: المستخدم غير موجود
 */
router.get("/:id", userController.getUserById);

/**
 * @swagger
 * /users:
 *   post:
 *     summary: إنشاء مستخدم جديد (للمشرف)
 *     tags: [👥 Users]
 *     security:
 *       - bearerAuth: []
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
 *               - role
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *               role:
 *                 type: string
 *                 enum: [client, vendor, driver, admin]
 *               isVerified:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: تم إنشاء المستخدم
 *       400:
 *         description: البريد الإلكتروني موجود مسبقاً
 */
router.post("/", userController.createUser);

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: تحديث مستخدم (للمشرف)
 *     tags: [👥 Users]
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
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               role:
 *                 type: string
 *               isVerified:
 *                 type: boolean
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: تم تحديث المستخدم
 *       404:
 *         description: المستخدم غير موجود
 */
router.put("/:id", userController.updateUserById);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: حذف مستخدم (للمشرف)
 *     tags: [👥 Users]
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
 *         description: تم حذف المستخدم
 *       404:
 *         description: المستخدم غير موجود
 */
router.delete("/:id", userController.deleteUserById);

module.exports = router;