// ============================================
// ملف: src/routes/chat.routes.js
// الوصف: مسارات الدردشة والمراسلة الموحدة
// الإصدار: 2.0
// ============================================

const express = require("express");
const router = express.Router();

const { chatController } = require('../controllers');
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
const PaginationUtils = require('../utils/pagination.util');

/**
 * @swagger
 * tags:
 *   name: 💬 Chat
 *   description: نظام الدردشة والمراسلة
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Message:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         conversationId:
 *           type: string
 *         sender:
 *           $ref: '#/components/schemas/User'
 *         type:
 *           type: string
 *           enum: [text, image, video, audio, location, contact, file]
 *         content:
 *           type: object
 *         mediaUrl:
 *           type: string
 *         isRead:
 *           type: boolean
 *         readBy:
 *           type: array
 *         createdAt:
 *           type: string
 *           format: date-time
 *         timeAgo:
 *           type: string
 *     
 *     Conversation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         type:
 *           type: string
 *           enum: [direct, group, support, order]
 *         title:
 *           type: string
 *         participants:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/User'
 *         lastMessage:
 *           $ref: '#/components/schemas/Message'
 *         unreadCount:
 *           type: integer
 *         isArchived:
 *           type: boolean
 *         isMuted:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *         lastActivity:
 *           type: string
 *           format: date-time
 */

// جميع المسارات تحتاج توثيق
router.use(auth);

// ========== 1. إدارة المحادثات ==========

/**
 * @swagger
 * /chat/conversations:
 *   get:
 *     summary: الحصول على قائمة محادثات المستخدم
 *     tags: [💬 Chat]
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
 *           enum: [direct, group, support, order]
 *       - in: query
 *         name: isArchived
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: قائمة المحادثات
 */
router.get("/conversations", PaginationUtils.validatePaginationParams, chatController.getUserConversations);

/**
 * @swagger
 * /chat/conversations/direct/{userId}:
 *   post:
 *     summary: إنشاء محادثة مباشرة مع مستخدم
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               initialMessage:
 *                 type: string
 *     responses:
 *       201:
 *         description: تم إنشاء المحادثة
 */
router.post("/conversations/direct/:userId", chatController.createDirectChat);

/**
 * @swagger
 * /chat/conversations/order/{orderId}:
 *   post:
 *     summary: إنشاء محادثة خاصة بالطلب
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: تم إنشاء محادثة الطلب
 */
router.post("/conversations/order/:orderId", chatController.createOrderChat);

/**
 * @swagger
 * /chat/conversations/support:
 *   post:
 *     summary: إنشاء محادثة مع الدعم الفني
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *             properties:
 *               subject:
 *                 type: string
 *               initialMessage:
 *                 type: string
 *               department:
 *                 type: string
 *                 enum: [technical, billing, general, complaints]
 *                 default: general
 *     responses:
 *       201:
 *         description: تم إنشاء تذكرة الدعم
 */
router.post("/conversations/support", chatController.createSupportChat);

/**
 * @swagger
 * /chat/conversations/group:
 *   post:
 *     summary: إنشاء محادثة جماعية
 *     tags: [💬 Chat]
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
 *               - participantIds
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               participantIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               isPublic:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: تم إنشاء المجموعة
 */
router.post("/conversations/group", chatController.createGroupChat);

/**
 * @swagger
 * /chat/conversations/{id}:
 *   get:
 *     summary: الحصول على تفاصيل محادثة
 *     tags: [💬 Chat]
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
 *         description: تفاصيل المحادثة
 */
router.get("/conversations/:id", chatController.getConversation);

/**
 * @swagger
 * /chat/conversations/{id}:
 *   put:
 *     summary: تحديث المحادثة (الاسم، الصورة)
 *     tags: [💬 Chat]
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *               notificationSettings:
 *                 type: object
 *               privacySettings:
 *                 type: object
 *     responses:
 *       200:
 *         description: تم تحديث المحادثة
 */
router.put("/conversations/:id", chatController.updateConversation);

/**
 * @swagger
 * /chat/conversations/{id}:
 *   delete:
 *     summary: حذف محادثة
 *     tags: [💬 Chat]
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
 *         description: تم حذف المحادثة
 */
router.delete("/conversations/:id", chatController.deleteConversation);

/**
 * @swagger
 * /chat/conversations/{id}/archive:
 *   put:
 *     summary: أرشفة محادثة
 *     tags: [💬 Chat]
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
 *         description: تم أرشفة المحادثة
 */
router.put("/conversations/:id/archive", chatController.archiveConversation);

/**
 * @swagger
 * /chat/conversations/{id}/mute:
 *   put:
 *     summary: كتم إشعارات المحادثة
 *     tags: [💬 Chat]
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
 *               duration:
 *                 type: string
 *                 enum: [1h, 8h, 24h, 7d, forever]
 *                 default: 24h
 *     responses:
 *       200:
 *         description: تم كتم المحادثة
 */
router.put("/conversations/:id/mute", chatController.muteConversation);

/**
 * @swagger
 * /chat/conversations/{id}/unmute:
 *   put:
 *     summary: إلغاء كتم المحادثة
 *     tags: [💬 Chat]
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
 *         description: تم إلغاء كتم المحادثة
 */
router.put("/conversations/:id/unmute", chatController.unmuteConversation);

// ========== 2. إدارة المشاركين ==========

/**
 * @swagger
 * /chat/conversations/{id}/participants:
 *   post:
 *     summary: إضافة مشارك للمحادثة الجماعية
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: تمت إضافة المشارك
 */
router.post("/conversations/:id/participants", chatController.addParticipant);

/**
 * @swagger
 * /chat/conversations/{id}/participants/{participantId}:
 *   delete:
 *     summary: إزالة مشارك من المحادثة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم إزالة المشارك
 */
router.delete("/conversations/:id/participants/:participantId", chatController.removeParticipant);

/**
 * @swagger
 * /chat/conversations/{id}/participants:
 *   get:
 *     summary: قائمة المشاركين في المحادثة
 *     tags: [💬 Chat]
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
 *         description: قائمة المشاركين
 */
router.get("/conversations/:id/participants", chatController.getParticipants);

/**
 * @swagger
 * /chat/conversations/{id}/participants/{participantId}/admin:
 *   put:
 *     summary: تعيين مشارك كمشرف
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم تعيين المشارك كمشرف
 */
router.put("/conversations/:id/participants/:participantId/admin", chatController.makeAdmin);

/**
 * @swagger
 * /chat/conversations/{id}/participants/{participantId}/admin:
 *   delete:
 *     summary: إزالة صلاحيات المشرف عن مشارك
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم إزالة صلاحيات المشرف
 */
router.delete("/conversations/:id/participants/:participantId/admin", chatController.removeAdmin);

// ========== 3. إدارة الرسائل ==========

/**
 * @swagger
 * /chat/conversations/{id}/messages:
 *   get:
 *     summary: الحصول على رسائل المحادثة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: قائمة الرسائل
 */
router.get("/conversations/:id/messages", PaginationUtils.validatePaginationParams, chatController.getConversationMessages);

/**
 * @swagger
 * /chat/conversations/{id}/messages/text:
 *   post:
 *     summary: إرسال رسالة نصية
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 5000
 *               replyTo:
 *                 type: string
 *               mentions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: تم إرسال الرسالة
 */
router.post("/conversations/:id/messages/text", chatController.sendTextMessage);

/**
 * @swagger
 * /chat/conversations/{id}/messages/media:
 *   post:
 *     summary: إرسال ملف وسائط (صورة، فيديو، صوت، ملف)
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               caption:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [image, video, audio, file]
 *     responses:
 *       201:
 *         description: تم إرسال الملف
 */
router.post("/conversations/:id/messages/media", upload("chat/media").single("file"), chatController.sendMediaMessage);

/**
 * @swagger
 * /chat/conversations/{id}/messages/location:
 *   post:
 *     summary: مشاركة موقع
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               address:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: تم مشاركة الموقع
 */
router.post("/conversations/:id/messages/location", chatController.sendLocationMessage);

/**
 * @swagger
 * /chat/conversations/{id}/messages/contact:
 *   post:
 *     summary: مشاركة جهة اتصال
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - phone
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       201:
 *         description: تم مشاركة جهة الاتصال
 */
router.post("/conversations/:id/messages/contact", chatController.sendContactMessage);

/**
 * @swagger
 * /chat/conversations/{conversationId}/messages/{messageId}:
 *   put:
 *     summary: تعديل رسالة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم تعديل الرسالة
 */
router.put("/conversations/:conversationId/messages/:messageId", chatController.updateMessage);

/**
 * @swagger
 * /chat/conversations/{conversationId}/messages/{messageId}:
 *   delete:
 *     summary: حذف رسالة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم حذف الرسالة
 */
router.delete("/conversations/:conversationId/messages/:messageId", chatController.deleteMessage);

/**
 * @swagger
 * /chat/conversations/{conversationId}/messages/{messageId}/forward/{toConversationId}:
 *   post:
 *     summary: إعادة توجيه رسالة إلى محادثة أخرى
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: toConversationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: تم إعادة توجيه الرسالة
 */
router.put("/conversations/:conversationId/messages/:messageId/forward/:toConversationId", chatController.forwardMessage);

// ========== 4. التفاعلات ==========

/**
 * @swagger
 * /chat/conversations/{conversationId}/messages/{messageId}/reactions:
 *   post:
 *     summary: إضافة تفاعل على رسالة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - emoji
 *             properties:
 *               emoji:
 *                 type: string
 *                 enum: [👍, 👎, ❤️, 😂, 😮, 😢, 😡, 🎉]
 *     responses:
 *       200:
 *         description: تم إضافة التفاعل
 */
router.post("/conversations/:conversationId/messages/:messageId/reactions", chatController.addReaction);

/**
 * @swagger
 * /chat/conversations/{conversationId}/messages/{messageId}/reactions:
 *   delete:
 *     summary: إزالة تفاعل من رسالة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم إزالة التفاعل
 */
router.delete("/conversations/:conversationId/messages/:messageId/reactions", chatController.removeReaction);

/**
 * @swagger
 * /chat/conversations/{conversationId}/messages/{messageId}/pin:
 *   post:
 *     summary: تثبيت رسالة في المحادثة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم تثبيت الرسالة
 */
router.post("/conversations/:conversationId/messages/:messageId/pin", chatController.pinMessage);

/**
 * @swagger
 * /chat/conversations/{conversationId}/messages/{messageId}/unpin:
 *   post:
 *     summary: إلغاء تثبيت رسالة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم إلغاء تثبيت الرسالة
 */
router.post("/conversations/:conversationId/messages/:messageId/unpin", chatController.unpinMessage);

/**
 * @swagger
 * /chat/conversations/{conversationId}/messages/{messageId}/star:
 *   post:
 *     summary: وضع علامة نجمة على رسالة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم وضع علامة نجمة
 */
router.post("/conversations/:conversationId/messages/:messageId/star", chatController.starMessage);

/**
 * @swagger
 * /chat/conversations/{conversationId}/messages/{messageId}/unstar:
 *   post:
 *     summary: إزالة علامة النجمة من رسالة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: تم إزالة النجمة
 */
router.post("/conversations/:conversationId/messages/:messageId/unstar", chatController.unstarMessage);

// ========== 5. البحث والوسائط ==========

/**
 * @swagger
 * /chat/conversations/{id}/search:
 *   get:
 *     summary: البحث في رسائل المحادثة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: senderId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: نتائج البحث
 */
router.get("/conversations/:id/search", chatController.searchMessages);

/**
 * @swagger
 * /chat/search:
 *   get:
 *     summary: بحث عام في جميع المحادثات
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: نتائج البحث
 */
router.get("/search", chatController.globalSearch);

/**
 * @swagger
 * /chat/conversations/{id}/media:
 *   get:
 *     summary: الحصول على ملفات الوسائط في المحادثة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [image, video, audio, file]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: قائمة الوسائط
 */
router.get("/conversations/:id/media", chatController.getConversationMedia);

/**
 * @swagger
 * /chat/conversations/{id}/files:
 *   get:
 *     summary: الحصول على الملفات في المحادثة
 *     tags: [💬 Chat]
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
 *         description: قائمة الملفات
 */
router.get("/conversations/:id/files", chatController.getConversationFiles);

/**
 * @swagger
 * /chat/conversations/{id}/links:
 *   get:
 *     summary: الحصول على الروابط المشتركة في المحادثة
 *     tags: [💬 Chat]
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
 *         description: قائمة الروابط
 */
router.get("/conversations/:id/links", chatController.getConversationLinks);

// ========== 6. الإحصائيات ==========

/**
 * @swagger
 * /chat/stats:
 *   get:
 *     summary: إحصائيات الدردشة العامة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الدردشة
 */
router.get("/stats", chatController.getChatStats);

/**
 * @swagger
 * /chat/conversations/{id}/stats:
 *   get:
 *     summary: إحصائيات محادثة محددة
 *     tags: [💬 Chat]
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
 *         description: إحصائيات المحادثة
 */
router.get("/conversations/:id/stats", chatController.getConversationStats);

/**
 * @swagger
 * /chat/conversations/{id}/online:
 *   get:
 *     summary: المشاركون المتواجدون حالياً
 *     tags: [💬 Chat]
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
 *         description: قائمة المشاركين المتصلين
 */
router.get("/conversations/:id/online", chatController.getOnlineParticipants);

/**
 * @swagger
 * /chat/unread/total:
 *   get:
 *     summary: إجمالي الرسائل غير المقروءة
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: عدد الرسائل غير المقروءة
 */
router.get("/unread/total", chatController.getTotalUnreadCount);

// ========== 7. مسارات الأدمن ==========

/**
 * @swagger
 * /chat/admin/support-conversations:
 *   get:
 *     summary: قائمة محادثات الدعم الفني (للمشرف)
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, pending, resolved, closed]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *       - in: query
 *         name: assignedTo
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: قائمة تذاكر الدعم
 *       403:
 *         description: غير مصرح - يتطلب صلاحيات المشرف
 */
router.get("/admin/support-conversations", role("admin"), chatController.getSupportConversations);

/**
 * @swagger
 * /chat/admin/conversations/{id}/assign:
 *   put:
 *     summary: تعيين محادثة دعم لموظف
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - agentId
 *             properties:
 *               agentId:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم تعيين المحادثة
 */
router.put("/admin/conversations/:id/assign", role("admin"), chatController.assignSupportAgent);

/**
 * @swagger
 * /chat/admin/conversations/{id}/resolve:
 *   put:
 *     summary: تعليم محادثة الدعم كمحلولة
 *     tags: [💬 Chat]
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
 *               resolution:
 *                 type: string
 *               satisfactionScore:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *     responses:
 *       200:
 *         description: تم إنهاء محادثة الدعم
 */
router.put("/admin/conversations/:id/resolve", role("admin"), chatController.resolveSupportChat);

/**
 * @swagger
 * /chat/admin/support-stats:
 *   get:
 *     summary: إحصائيات الدعم الفني
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الدعم
 */
router.get("/admin/support-stats", role("admin"), chatController.getSupportStats);

/**
 * @swagger
 * /chat/admin/all-conversations:
 *   get:
 *     summary: قائمة جميع المحادثات (للمشرف)
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [direct, group, support, order]
 *     responses:
 *       200:
 *         description: قائمة المحادثات
 */
router.get("/admin/all-conversations", role("admin"), chatController.getAllConversations);

/**
 * @swagger
 * /chat/admin/conversations/{id}:
 *   delete:
 *     summary: حذف محادثة (للمشرف)
 *     tags: [💬 Chat]
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
 *         description: تم حذف المحادثة
 */
router.delete("/admin/conversations/:id", role("admin"), chatController.adminDeleteConversation);

/**
 * @swagger
 * /chat/admin/broadcast:
 *   post:
 *     summary: إرسال رسالة جماعية لجميع المستخدمين
 *     tags: [💬 Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [text, image, link]
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [client, vendor, driver, all]
 *               link:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم إرسال الرسالة الجماعية
 */
router.post("/admin/broadcast", role("admin"), chatController.broadcastMessage);

module.exports = router;