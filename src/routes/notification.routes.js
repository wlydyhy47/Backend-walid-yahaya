// ============================================
// ملف: src/routes/notification.routes.js
// الوصف: مسارات الإشعارات الموحدة
// ============================================

const express = require("express");
const router = express.Router();

const { notificationController } = require('../controllers');
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const PaginationUtils = require('../utils/pagination.util');

/**
 * @swagger
 * tags:
 *   name: 🔔 Notifications
 *   description: إدارة الإشعارات
 */

// جميع المسارات تحتاج توثيق
router.use(auth);

// ========== 1. مسارات المستخدم العادي ==========

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: قائمة إشعاراتي
 *     tags: [🔔 Notifications]
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [order, promotion, system, chat, loyalty]
 *       - in: query
 *         name: isRead
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: قائمة الإشعارات
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/", PaginationUtils.validatePaginationParams, notificationController.getUserNotifications);

/**
 * @swagger
 * /notifications/stats:
 *   get:
 *     summary: إحصائيات الإشعارات
 *     tags: [🔔 Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الإشعارات
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
 *                     unread:
 *                       type: integer
 *                     byType:
 *                       type: object
 */
router.get("/stats", notificationController.getNotificationStats);

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: عدد الإشعارات غير المقروءة
 *     tags: [🔔 Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: عدد الإشعارات غير المقروءة
 */
router.get("/unread-count", notificationController.getUnreadCount);

/**
 * @swagger
 * /notifications/{id}/read:
 *   put:
 *     summary: تعليم إشعار كمقروء
 *     tags: [🔔 Notifications]
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
 *         description: تم تعليم الإشعار كمقروء
 */
router.put("/:id/read", notificationController.markAsRead);

/**
 * @swagger
 * /notifications/{id}/unread:
 *   put:
 *     summary: تعليم إشعار كغير مقروء
 *     tags: [🔔 Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.put("/:id/unread", notificationController.markAsUnread);

/**
 * @swagger
 * /notifications/{id}/archive:
 *   put:
 *     summary: أرشفة إشعار
 *     tags: [🔔 Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.put("/:id/archive", notificationController.archive);

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     summary: حذف إشعار
 *     tags: [🔔 Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.delete("/:id", notificationController.deleteNotification);

/**
 * @swagger
 * /notifications/mark-all-read:
 *   put:
 *     summary: تعليم جميع الإشعارات كمقروءة
 *     tags: [🔔 Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.put("/mark-all-read", notificationController.markAllAsRead);

/**
 * @swagger
 * /notifications/read/cleanup:
 *   delete:
 *     summary: حذف جميع الإشعارات المقروءة
 *     tags: [🔔 Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.delete("/read/cleanup", notificationController.deleteReadNotifications);

/**
 * @swagger
 * /notifications/preferences:
 *   put:
 *     summary: تحديث تفضيلات الإشعارات
 *     tags: [🔔 Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: boolean
 *               push:
 *                 type: boolean
 *               sms:
 *                 type: boolean
 *               orderUpdates:
 *                 type: boolean
 *               promotions:
 *                 type: boolean
 *               system:
 *                 type: boolean
 */
router.put("/preferences", notificationController.updateNotificationPreferences);

/**
 * @swagger
 * /notifications/devices:
 *   post:
 *     summary: تسجيل جهاز للإشعارات
 *     tags: [🔔 Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceId
 *               - platform
 *             properties:
 *               deviceId:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [ios, android, web]
 *               pushToken:
 *                 type: string
 *               model:
 *                 type: string
 *               appVersion:
 *                 type: string
 */
router.post("/devices", notificationController.registerDevice);

/**
 * @swagger
 * /notifications/devices/{deviceId}:
 *   delete:
 *     summary: إلغاء تسجيل جهاز
 *     tags: [🔔 Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.delete("/devices/:deviceId", notificationController.unregisterDevice);

// ========== 2. مسارات الأدمن ==========

/**
 * @swagger
 * /notifications/send:
 *   post:
 *     summary: إرسال إشعار مخصص (للمشرف فقط)
 *     tags: [🔔 Notifications]
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
 *               - message
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [order, promotion, system, chat, loyalty]
 *               recipients:
 *                 type: object
 *                 properties:
 *                   all:
 *                     type: boolean
 *                   roles:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: [client, vendor, driver]
 *                   userIds:
 *                     type: array
 *                     items:
 *                       type: string
 *               data:
 *                 type: object
 *               schedule:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: تم إرسال الإشعار
 *       403:
 *         description: غير مصرح - يتطلب صلاحيات المشرف
 */
router.post("/send", role("admin"), notificationController.sendCustomNotification);

/**
 * @swagger
 * /notifications/campaign/{campaignId}/stats:
 *   get:
 *     summary: إحصائيات حملة إشعارات
 *     tags: [🔔 Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get("/campaign/:campaignId/stats", role("admin"), notificationController.getCampaignStats);

/**
 * @swagger
 * /notifications/all/stats:
 *   get:
 *     summary: إحصائيات جميع الإشعارات (للمشرف)
 *     tags: [🔔 Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get("/all/stats", role("admin"), notificationController.getAllNotificationsStats);

module.exports = router;