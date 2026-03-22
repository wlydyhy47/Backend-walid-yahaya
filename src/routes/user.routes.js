// ============================================
// ملف: src/routes/user.routes.js (المُصلح - تم إزالة الازدواجية)
// الوصف: مسارات المستخدمين - فقط مسارات الأدمن
// الإصدار: 5.0
// ============================================

const express = require("express");
const router = express.Router();

// ✅ استيراد موحد للـ Controllers
const { 
  userController 
} = require('../controllers');

// ✅ الـ middlewares
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
const PaginationUtils = require('../utils/pagination.util');

// ========== 1. مسارات المسؤول فقط ==========
/**
 * @swagger
 * /api/v1/admin/users:
 *   get:
 *     summary: الحصول على جميع المستخدمين
 *     description: مسار مخصص للمسؤولين لعرض قائمة بجميع المستخدمين مع دعم التصفح
 *     tags: [Users, Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: رقم الصفحة
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: عدد العناصر في الصفحة
 *     responses:
 *       200:
 *         description: قائمة المستخدمين
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: غير مصرح لك (تحتاج صلاحيات أدمن)
 */
router.get("/admin/users", auth, role("admin"), PaginationUtils.validatePaginationParams, userController.getUsers);

/**
 * @swagger
 * /api/v1/admin/users/{id}:
 *   get:
 *     summary: الحصول على مستخدم محدد
 *     tags: [Users, Admin]
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
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get("/admin/users/:id", auth, role("admin"), userController.getUserById);

/**
 * @swagger
 * /api/v1/admin/users:
 *   post:
 *     summary: إنشاء مستخدم جديد (بواسطة الأدمن)
 *     tags: [Users, Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: تم إنشاء المستخدم
 */
router.post("/admin/users", auth, role("admin"), userController.createUser);

/**
 * @route   PUT /api/v1/admin/users/:id
 * @desc    تحديث مستخدم
 * @access  Admin
 */
router.put("/admin/users/:id", auth, role("admin"), userController.updateUserById);

/**
 * @route   DELETE /api/v1/admin/users/:id
 * @desc    حذف/تعطيل مستخدم
 * @access  Admin
 */
router.delete("/admin/users/:id", auth, role("admin"), userController.deleteUserById);

// ========== ملاحظة: مسارات المستخدم الشخصي (profile, favorites, etc) ==========
// تم نقلها بالكامل إلى client.routes.js لتجنب الازدواجية
// الرجاء استخدام client.routes.js للمسارات التالية:
// - /client/profile
// - /client/favorites
// - /client/stats
// - /client/activity
// - /client/presence

module.exports = router;