const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

/**
 * 🔔 الإشعارات الشخصية (للمستخدم الحالي)
 */

// الحصول على إشعارات المستخدم
router.get("/", auth, notificationController.getUserNotifications);

// الحصول على إحصائيات الإشعارات
router.get("/stats", auth, notificationController.getNotificationStats);

// تحديث حالة إشعار معين
router.put("/:id/status", auth, notificationController.updateNotificationStatus);

// تحديد جميع الإشعارات كمقروءة
router.put("/mark-all-read", auth, notificationController.markAllAsRead);

// حذف إشعار معين
router.delete("/:id", auth, notificationController.deleteNotification);

// حذف جميع الإشعارات المقروءة
router.delete("/read/cleanup", auth, notificationController.deleteReadNotifications);

// تحديث تفضيلات الإشعارات
router.put("/preferences", auth, notificationController.updateNotificationPreferences);

// تسجيل جهاز لـ Push Notifications
router.post("/devices", auth, notificationController.registerDevice);

/**
 * 👑 إدارة الإشعارات (للأدمن فقط)
 */

// إرسال إشعار مخصص
router.post("/send", auth, role("admin"), notificationController.sendCustomNotification);

// الحصول على إحصائيات الحملة
router.get("/campaign/:campaignId/stats", auth, role("admin"), notificationController.getCampaignStats);

module.exports = router;