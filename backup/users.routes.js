// src/routes/admin/users.routes.js

const express = require('express');
const router = express.Router();
const auth = require('../../middlewares/auth.middleware');
const role = require('../../middlewares/role.middleware');
const userCompleteController = require('../../controllers/userComplete.controller');

// جميع المسارات هنا تحتاج أدمن
router.use(auth, role('admin'));

/**
 * @route   GET /api/admin/users
 * @desc    الحصول على جميع المستخدمين
 * @access  Admin
 */
router.get('/', userCompleteController.getAllUsers);

/**
 * @route   GET /api/admin/users/:id
 * @desc    الحصول على مستخدم معين
 * @access  Admin
 */
router.get('/:id', userCompleteController.getUserById);

/**
 * @route   PUT /api/admin/users/:id
 * @desc    تحديث مستخدم
 * @access  Admin
 */
router.put('/:id', userCompleteController.updateUserById);

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    حذف/تعطيل مستخدم
 * @access  Admin
 */
router.delete('/:id', userCompleteController.deleteUserById);

module.exports = router;