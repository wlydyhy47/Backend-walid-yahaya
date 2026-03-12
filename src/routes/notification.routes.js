// ============================================
// ملف: src/routes/notification.routes.js (محدث)
// ============================================

const express = require("express");
const router = express.Router();

// ✅ استيراد موحد
const { notificationController } = require('../controllers');

// الـ middlewares
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const PaginationUtils = require('../utils/pagination.util');

// ========== جميع المسارات تحتاج توثيق ==========
router.use(auth);

// ========== 1. مسارات المستخدم العادي ==========
router.get("/", PaginationUtils.validatePaginationParams, notificationController.getUserNotifications);
router.get("/stats", notificationController.getNotificationStats);
router.get("/unread-count", notificationController.getUnreadCount);
router.put("/:id/read", notificationController.markAsRead);
router.put("/:id/unread", notificationController.markAsUnread);
router.put("/:id/archive", notificationController.archive);
router.delete("/:id", notificationController.deleteNotification);
router.put("/mark-all-read", notificationController.markAllAsRead);
router.delete("/read/cleanup", notificationController.deleteReadNotifications);
router.put("/preferences", notificationController.updateNotificationPreferences);
router.post("/devices", notificationController.registerDevice);
router.delete("/devices/:deviceId", notificationController.unregisterDevice);

// ========== 2. مسارات الأدمن ==========
router.post("/send", role("admin"), notificationController.sendCustomNotification);
router.get("/campaign/:campaignId/stats", role("admin"), notificationController.getCampaignStats);
router.get("/all/stats", role("admin"), notificationController.getAllNotificationsStats);

module.exports = router;