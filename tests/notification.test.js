// ============================================
// ملف: tests/notification.test.js (محدث)
// الوصف: اختبارات الإشعارات
// ============================================
// في بداية الملف
const setup = require('./setup'); // هذا سيضمن تشغيل setup.js أولاً
const request = require('supertest');
const app = require('../src/app');
const Notification = require('../src/models/notification.model');

// استخدام الدوال المساعدة مباشرة من global بدون destructuring
// لأن Jest يقوم بتعريفها في النطاق العام تلقائياً

describe('🔔 اختبارات الإشعارات (Notifications)', () => {
  let userToken;
  let adminToken;
  let testUser;
  let testAdmin;

  beforeEach(async () => {
    // إنشاء مستخدم عادي
    testUser = await global.createTestUser({
      phone: '+212600000600',
      role: 'client'
    });
    userToken = global.generateTestToken(testUser._id, 'client');

    // إنشاء أدمن
    testAdmin = await global.createTestUser({
      phone: '+212600000601',
      role: 'admin'
    });
    adminToken = global.generateTestToken(testAdmin._id, 'admin');
  });

  // ========== 1. اختبارات جلب الإشعارات ==========
  describe('GET /api/v1/notifications', () => {
    beforeEach(async () => {
      // إنشاء بعض الإشعارات
      for (let i = 0; i < 5; i++) {
        await Notification.create({
          user: testUser._id,
          type: 'system',
          title: `إشعار ${i}`,
          content: `محتوى الإشعار ${i}`,
          priority: 'medium'
        });
      }
    });

    it('يجب جلب إشعارات المستخدم', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notifications).toHaveLength(5);
      expect(response.body.data.stats).toHaveProperty('unreadCount');
    });

    it('يجب دعم pagination', async () => {
      const response = await request(app)
        .get('/api/v1/notifications?page=1&limit=2')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notifications).toHaveLength(2);
      expect(response.body.data.pagination).toHaveProperty('total', 5);
    });
  });

  // ========== 2. اختبارات تحديث حالة الإشعار ==========
  describe('PUT /api/v1/notifications/:id/read', () => {
    let testNotification;

    beforeEach(async () => {
      testNotification = await Notification.create({
        user: testUser._id,
        type: 'system',
        title: 'إشعار اختبار',
        content: 'محتوى الاختبار',
        status: 'unread'
      });
    });

    it('يجب تحديث إشعار كمقروء', async () => {
      const response = await request(app)
        .put(`/api/v1/notifications/${testNotification._id}/read`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      const updated = await Notification.findById(testNotification._id);
      expect(updated.status).toBe('read');
      expect(updated.readAt).toBeDefined();
    });

    it('يجب رفض تحديث إشعار لمستخدم آخر', async () => {
      const otherUser = await global.createTestUser({ phone: '+212600000602' });
      const otherNotification = await Notification.create({
        user: otherUser._id,
        type: 'system',
        title: 'إشعار آخر',
        content: 'محتوى آخر'
      });

      const response = await request(app)
        .put(`/api/v1/notifications/${otherNotification._id}/read`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ========== 3. اختبارات تحديد الكل كمقروء ==========
  describe('PUT /api/v1/notifications/mark-all-read', () => {
    beforeEach(async () => {
      // إنشاء عدة إشعارات غير مقروءة
      for (let i = 0; i < 3; i++) {
        await Notification.create({
          user: testUser._id,
          type: 'system',
          title: `إشعار ${i}`,
          content: `محتوى ${i}`,
          status: 'unread'
        });
      }
    });

    it('يجب تحديد جميع الإشعارات كمقروءة', async () => {
      const response = await request(app)
        .put('/api/v1/notifications/mark-all-read')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      const unreadCount = await Notification.countDocuments({
        user: testUser._id,
        status: 'unread'
      });
      expect(unreadCount).toBe(0);
    });
  });

  // ========== 4. اختبارات إرسال إشعار مخصص (للمسؤول) ==========
  describe('POST /api/v1/notifications/send', () => {
    it('يجب إرسال إشعار مخصص من قبل المسؤول', async () => {
      const notificationData = {
        userIds: [testUser._id.toString()],
        title: 'إشعار هام',
        content: 'هذا إشعار اختبار',
        type: 'announcement',
        priority: 'high'
      };

      const response = await request(app)
        .post('/api/v1/notifications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(notificationData)
        .expect(200);

      expect(response.body.success).toBe(true);

      // التحقق من وصول الإشعار
      const notification = await Notification.findOne({ user: testUser._id });
      expect(notification).toBeTruthy();
      expect(notification.title).toBe(notificationData.title);
    });

    it('يجب رفض إرسال إشعار من قبل مستخدم عادي', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/send')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          userIds: [testUser._id.toString()],
          title: 'إشعار',
          content: 'محتوى'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  // ========== 5. اختبارات حذف الإشعار ==========
  describe('DELETE /api/v1/notifications/:id', () => {
    let testNotification;

    beforeEach(async () => {
      testNotification = await Notification.create({
        user: testUser._id,
        type: 'system',
        title: 'إشعار للحذف',
        content: 'محتوى للحذف'
      });
    });

    it('يجب حذف إشعار', async () => {
      const response = await request(app)
        .delete(`/api/v1/notifications/${testNotification._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      const deleted = await Notification.findById(testNotification._id);
      expect(deleted).toBeNull();
    });
  });

  // ========== 6. اختبارات إحصائيات الإشعارات ==========
  describe('GET /api/v1/notifications/stats', () => {
    beforeEach(async () => {
      // إنشاء إشعارات بحالات مختلفة
      await Notification.create({
        user: testUser._id,
        type: 'system',
        title: 'مقروء',
        content: 'محتوى',
        status: 'read'
      });
      await Notification.create({
        user: testUser._id,
        type: 'order_created',
        title: 'غير مقروء',
        content: 'محتوى',
        status: 'unread'
      });
      await Notification.create({
        user: testUser._id,
        type: 'promotion',
        title: 'غير مقروء',
        content: 'محتوى',
        status: 'unread'
      });
    });

    it('يجب جلب إحصائيات الإشعارات', async () => {
      const response = await request(app)
        .get('/api/v1/notifications/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totals.total).toBe(3);
      expect(response.body.data.totals.unread).toBe(2);
      expect(response.body.data.byType).toBeDefined();
    });
  });
});