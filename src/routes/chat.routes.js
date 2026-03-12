// ============================================
// ملف: src/routes/chat.routes.js (محدث)
// ============================================

const express = require("express");
const router = express.Router();

// ✅ استيراد موحد
const { chatController } = require('../controllers');

// الـ middlewares
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
const PaginationUtils = require('../utils/pagination.util');

// جميع المسارات تحتاج توثيق
router.use(auth);

// ========== 1. إدارة المحادثات ==========
router.get("/conversations", PaginationUtils.validatePaginationParams, chatController.getUserConversations);
router.post("/conversations/direct/:userId", chatController.createDirectChat);
router.post("/conversations/order/:orderId", chatController.createOrderChat);
router.post("/conversations/support", chatController.createSupportChat);
router.post("/conversations/group", chatController.createGroupChat);
router.get("/conversations/:id", chatController.getConversation);
router.put("/conversations/:id", chatController.updateConversation);
router.delete("/conversations/:id", chatController.deleteConversation);
router.put("/conversations/:id/archive", chatController.archiveConversation);
router.put("/conversations/:id/mute", chatController.muteConversation);
router.put("/conversations/:id/unmute", chatController.unmuteConversation);

// ========== 2. إدارة المشاركين ==========
router.post("/conversations/:id/participants", chatController.addParticipant);
router.delete("/conversations/:id/participants/:participantId", chatController.removeParticipant);
router.get("/conversations/:id/participants", chatController.getParticipants);
router.put("/conversations/:id/participants/:participantId/admin", chatController.makeAdmin);
router.delete("/conversations/:id/participants/:participantId/admin", chatController.removeAdmin);

// ========== 3. إدارة الرسائل ==========
router.get("/conversations/:id/messages", PaginationUtils.validatePaginationParams, chatController.getConversationMessages);
router.post("/conversations/:id/messages/text", chatController.sendTextMessage);
router.post("/conversations/:id/messages/media", upload("chat/media").single("file"), chatController.sendMediaMessage);
router.post("/conversations/:id/messages/location", chatController.sendLocationMessage);
router.post("/conversations/:id/messages/contact", chatController.sendContactMessage);
router.put("/conversations/:conversationId/messages/:messageId", chatController.updateMessage);
router.delete("/conversations/:conversationId/messages/:messageId", chatController.deleteMessage);
router.put("/conversations/:conversationId/messages/:messageId/forward/:toConversationId", chatController.forwardMessage);

// ========== 4. التفاعلات ==========
router.post("/conversations/:conversationId/messages/:messageId/reactions", chatController.addReaction);
router.delete("/conversations/:conversationId/messages/:messageId/reactions", chatController.removeReaction);
router.post("/conversations/:conversationId/messages/:messageId/pin", chatController.pinMessage);
router.post("/conversations/:conversationId/messages/:messageId/unpin", chatController.unpinMessage);
router.post("/conversations/:conversationId/messages/:messageId/star", chatController.starMessage);
router.post("/conversations/:conversationId/messages/:messageId/unstar", chatController.unstarMessage);

// ========== 5. البحث والوسائط ==========
router.get("/conversations/:id/search", chatController.searchMessages);
router.get("/search", chatController.globalSearch);
router.get("/conversations/:id/media", chatController.getConversationMedia);
router.get("/conversations/:id/files", chatController.getConversationFiles);
router.get("/conversations/:id/links", chatController.getConversationLinks);

// ========== 6. الإحصائيات ==========
router.get("/stats", chatController.getChatStats);
router.get("/conversations/:id/stats", chatController.getConversationStats);
router.get("/conversations/:id/online", chatController.getOnlineParticipants);
router.get("/unread/total", chatController.getTotalUnreadCount);

// ========== 7. مسارات الأدمن ==========
router.get("/admin/support-conversations", role("admin"), chatController.getSupportConversations);
router.put("/admin/conversations/:id/assign", role("admin"), chatController.assignSupportAgent);
router.put("/admin/conversations/:id/resolve", role("admin"), chatController.resolveSupportChat);
router.get("/admin/support-stats", role("admin"), chatController.getSupportStats);
router.get("/admin/all-conversations", role("admin"), chatController.getAllConversations);
router.delete("/admin/conversations/:id", role("admin"), chatController.adminDeleteConversation);
router.post("/admin/broadcast", role("admin"), chatController.broadcastMessage);

module.exports = router;