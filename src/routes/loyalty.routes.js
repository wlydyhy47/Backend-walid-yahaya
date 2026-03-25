// ============================================
// ملف: src/routes/loyalty.routes.js
// الوصف: نظام الولاء والنقاط
// الإصدار: 2.0
// ============================================

const express = require('express');
const router = express.Router();

const { loyaltyController } = require('../controllers');
const auth = require('../middlewares/auth.middleware');
const role = require('../middlewares/role.middleware');

/**
 * @swagger
 * tags:
 *   name: 🎁 Loyalty
 *   description: نظام الولاء والمكافآت
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     LoyaltyPoints:
 *       type: object
 *       properties:
 *         current:
 *           type: integer
 *           example: 1250
 *         tier:
 *           type: string
 *           enum: [bronze, silver, gold, platinum]
 *           example: silver
 *         nextTier:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               example: gold
 *             pointsNeeded:
 *               type: integer
 *               example: 750
 *             progress:
 *               type: number
 *               example: 62.5
 *         lifetimePoints:
 *           type: integer
 *           example: 2500
 *         expiringPoints:
 *           type: integer
 *           example: 100
 *         history:
 *           type: object
 *           properties:
 *             earned:
 *               type: integer
 *             redeemed:
 *               type: integer
 *     
 *     LoyaltyReward:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         points:
 *           type: integer
 *         category:
 *           type: string
 *           enum: [discount, delivery, food, special]
 *         image:
 *           type: string
 *         discountValue:
 *           type: number
 *         discountType:
 *           type: string
 *           enum: [percentage, fixed]
 *         validUntil:
 *           type: string
 *           format: date-time
 *         isSpecial:
 *           type: boolean
 */

// ========== مسارات المستخدم العادي ==========

/**
 * @swagger
 * /loyalty/points:
 *   get:
 *     summary: الحصول على نقاط الولاء الخاصة بي
 *     tags: [🎁 Loyalty]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: نقاط الولاء
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/LoyaltyPoints'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/points', auth, loyaltyController.getPoints);

/**
 * @swagger
 * /loyalty/rewards:
 *   get:
 *     summary: الحصول على قائمة المكافآت المتاحة
 *     tags: [🎁 Loyalty]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [discount, delivery, food, special]
 *       - in: query
 *         name: minPoints
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: قائمة المكافآت
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
 *                     available:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/LoyaltyReward'
 *                     upcoming:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/LoyaltyReward'
 *                     special:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/LoyaltyReward'
 *                     userPoints:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/rewards', auth, loyaltyController.getRewards);

/**
 * @swagger
 * /loyalty/transactions:
 *   get:
 *     summary: سجل معاملات النقاط
 *     tags: [🎁 Loyalty]
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
 *           enum: [earn, redeem, expire]
 *     responses:
 *       200:
 *         description: سجل المعاملات
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
 *                     transactions:
 *                       type: array
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                     stats:
 *                       type: object
 */
router.get('/transactions', auth, loyaltyController.getTransactions);

/**
 * @swagger
 * /loyalty/points/redeem:
 *   post:
 *     summary: استبدال النقاط بمكافأة
 *     tags: [🎁 Loyalty]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rewardId
 *             properties:
 *               rewardId:
 *                 type: string
 *                 example: 60d21b4667d0d8992e610c95
 *               orderId:
 *                 type: string
 *                 description: معرف الطلب (إذا كان الاستبدال لطلب حالي)
 *     responses:
 *       200:
 *         description: تم استبدال النقاط بنجاح
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
 *                     reward:
 *                       $ref: '#/components/schemas/LoyaltyReward'
 *                     pointsAfter:
 *                       type: integer
 *                     code:
 *                       type: string
 *       400:
 *         description: نقاط غير كافية أو المكافأة غير متاحة
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/points/redeem', auth, loyaltyController.redeemPoints);

/**
 * @swagger
 * /loyalty/stats:
 *   get:
 *     summary: إحصائيات الولاء
 *     tags: [🎁 Loyalty]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: إحصائيات الولاء
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
 *                     currentPoints:
 *                       type: integer
 *                     tier:
 *                       type: string
 *                     multiplier:
 *                       type: number
 *                     memberSince:
 *                       type: string
 *                     lastActivity:
 *                       type: string
 *                     totalTransactions:
 *                       type: integer
 *                     monthly:
 *                       type: object
 *                     nextTier:
 *                       type: object
 */
router.get('/stats', auth, loyaltyController.getStats);

// ========== مسارات الأدمن فقط ==========

/**
 * @swagger
 * /loyalty/points/add:
 *   post:
 *     summary: إضافة نقاط للمستخدم (للمشرف فقط)
 *     tags: [🎁 Loyalty]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - points
 *             properties:
 *               userId:
 *                 type: string
 *               points:
 *                 type: integer
 *                 minimum: 1
 *               reason:
 *                 type: string
 *                 example: compensation for delayed order
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: تم إضافة النقاط
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     newBalance:
 *                       type: integer
 *                     transaction:
 *                       type: object
 *       403:
 *         description: غير مصرح - يتطلب صلاحيات المشرف
 *       404:
 *         description: المستخدم غير موجود
 */
router.post('/points/add', auth, role('admin'), loyaltyController.addPoints);

module.exports = router;