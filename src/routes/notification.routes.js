// ============================================
// ملف: src/routes/notification.routes.js
// الوصف: مسارات الإشعارات الموحدة
// الإصدار: 2.0
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
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
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
 *                     totals:
 *                       type: object
 *                     byStatus:
 *                       type: array
 *                     byType:
 *                       type: array
 *                     byPriority:
 *                       type: array
 *                     byDay:
 *                       type: array
 *                     readRate:
 *                       type: string
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
 *                     unreadCount:
 *                       type: integer
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
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم تعليم الإشعار كغير مقروء
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
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم أرشفة الإشعار
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
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم حذف الإشعار
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
 *     responses:
 *       200:
 *         description: تم تعليم جميع الإشعارات كمقروءة
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
 *     parameters:
 *       - in: query
 *         name: olderThan
 *         schema:
 *           type: integer
 *           description: حذف الإشعارات الأقدم من عدد الأيام
 *     responses:
 *       200:
 *         description: تم حذف الإشعارات المقروءة
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
 *     responses:
 *       200:
 *         description: تم تحديث تفضيلات الإشعارات
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
 *               deviceModel:
 *                 type: string
 *               osVersion:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم تسجيل الجهاز
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
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم إلغاء تسجيل الجهاز
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
 *               - userIds
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               type:
 *                 type: string
 *                 enum: [order, promotion, system, chat, loyalty]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *               data:
 *                 type: object
 *               link:
 *                 type: string
 *               icon:
 *                 type: string
 *               campaignId:
 *                 type: string
 *               schedule:
 *                 type: string
 *                 format: date-time
 *               group:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               settings:
 *                 type: object
 *                 properties:
 *                   push:
 *                     type: boolean
 *                   email:
 *                     type: boolean
 *                   sms:
 *                     type: boolean
 *                   inApp:
 *                     type: boolean
 *     responses:
 *       201:
 *         description: تم إرسال الإشعارات
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
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: إحصائيات الحملة
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
 *                     summary:
 *                       type: object
 *                     byType:
 *                       type: object
 *                     byPriority:
 *                       type: object
 *                     byDay:
 *                       type: array
 *                     delivery:
 *                       type: object
 *                     timeline:
 *                       type: object
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
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: إحصائيات جميع الإشعارات
 */
router.get("/all/stats", role("admin"), notificationController.getAllNotificationsStats);

module.exports = router;