const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chat.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
// في routes/chat.routes.js - إضافة في الأعلى
const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");

/**
 * 💬 المحادثات
 */

// الحصول على محادثات المستخدم
router.get("/conversations", auth, chatController.getUserConversations);

// إنشاء محادثة جديدة
router.post("/conversations", auth, chatController.createConversation);

// الحصول على محادثة معينة
router.get("/conversations/:id", auth, chatController.getConversation);

// تحديث محادثة
router.put("/conversations/:id", auth, chatController.updateConversation);

// إضافة مشارك للمحادثة
router.post("/conversations/:id/participants", auth, chatController.addParticipant);

// إزالة مشارك من المحادثة
router.delete("/conversations/:id/participants/:participantId", auth, chatController.removeParticipant);

/**
 * 💬 الرسائل
 */

// الحصول على رسائل المحادثة
router.get("/conversations/:id/messages", auth, chatController.getConversationMessages);

// إرسال رسالة نصية
router.post("/conversations/:id/messages", auth, chatController.sendMessage);

// تحديث رسالة
router.put("/conversations/:conversationId/messages/:messageId", auth, chatController.updateMessage);

// حذف رسالة
router.delete("/conversations/:conversationId/messages/:messageId", auth, chatController.deleteMessage);

// البحث في رسائل المحادثة
router.get("/conversations/:id/search", auth, chatController.searchMessages);

// رفع ملف للمحادثة
router.post(
  "/conversations/:id/upload",
  auth,
  upload("chat/files").single("file"),
  chatController.uploadFile
);

/**
 * 💬 التفاعلات
 */

// إضافة رد فعل على رسالة
router.post("/conversations/:conversationId/messages/:messageId/reactions", auth, chatController.addReaction);

// إزالة رد فعل من رسالة
router.delete("/conversations/:conversationId/messages/:messageId/reactions", auth, chatController.removeReaction);

// تثبيت رسالة
router.post("/conversations/:conversationId/messages/:messageId/pin", auth, chatController.pinMessage);

/**
 * 📊 الإحصائيات والإدارة
 */

// إحصائيات الدردشة
router.get("/stats", auth, chatController.getChatStats);

// دعم الدردشات (للأدمن فقط)
router.get("/admin/support-conversations", auth, role("admin"), async (req, res) => {
  try {
    const { status, department, assignedTo } = req.query;
    
    const query = {
      type: "support",
      deletedAt: null,
    };
    
    if (status) query["metadata.support.status"] = status;
    if (department) query["metadata.support.department"] = department;
    if (assignedTo) query["metadata.support.assignedTo"] = assignedTo;

    const conversations = await Conversation.find(query)
      .populate("participants", "name image")
      .populate("metadata.support.assignedTo", "name image")
      .sort({ lastActivity: -1 })
      .limit(50)
      .lean();

    // إحصائيات الدعم
    const stats = await Conversation.aggregate([
      { $match: { type: "support", deletedAt: null } },
      {
        $group: {
          _id: {
            status: "$metadata.support.status",
            department: "$metadata.support.department",
          },
          count: { $sum: 1 },
          avgResponseTime: { $avg: "$stats.avgResponseTime" },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        conversations,
        stats: stats.reduce((acc, item) => {
          if (!acc[item._id.department]) {
            acc[item._id.department] = {};
          }
          acc[item._id.department][item._id.status] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("Support conversations error:", error);
    res.status(500).json({ message: "Failed to get support conversations" });
  }
});

// تعيين محادثة دعم (للأدمن فقط)
router.put("/admin/conversations/:id/assign", auth, role("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;

    const conversation = await Conversation.findByIdAndUpdate(
      id,
      {
        "metadata.support.assignedTo": assignedTo,
        "metadata.support.status": "pending",
      },
      { new: true }
    )
      .populate("metadata.support.assignedTo", "name image")
      .populate("participants", "name image");

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // إرسال رسالة نظام
    await Message.createSystemMessage(
      conversation._id,
      "support_assigned",
      {
        assignedTo: conversation.metadata.support.assignedTo,
        assignedBy: req.user.id,
      }
    );

    res.json({
      success: true,
      message: "Conversation assigned successfully",
      data: { conversation },
    });
  } catch (error) {
    console.error("Assign conversation error:", error);
    res.status(500).json({ message: "Failed to assign conversation" });
  }
});

module.exports = router;