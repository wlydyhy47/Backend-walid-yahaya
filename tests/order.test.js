// ============================================
// ملف: tests/order.test.js
// الوصف: اختبارات الطلبات
// ============================================

const request = require('supertest');
const app = require('../src/app');
const Order = require('../src/models/order.model');
const DriverLocation = require('../src/models/driverLocation.model');

describe('📦 اختبارات الطلبات (Orders)', () => {
  let clientToken;
  let driverToken;
  let adminToken;
  let testClient;
  let testDriver;
  let testRestaurant;
  let testAddress;

  beforeEach(async () => {
    // إنشاء عميل
    testClient = await createTestUser({
      phone: '+212600000400',
      role: 'client'
    });
    clientToken = generateTestToken(testClient._id, 'client');

    // إنشاء مندوب
    testDriver = await createTestUser({
      phone: '+212600000401',
      role: 'driver'
    });
    driverToken = generateTestToken(testDriver._id, 'driver');

    // إنشاء أدمن
    const admin = await createTestUser({
      phone: '+212600000402',
      role: 'admin'
    });
    adminToken = generateTestToken(admin._id, 'admin');

    // إنشاء مطعم
    testRestaurant = await createTestRestaurant();

    // إنشاء عنوان
    testAddress = await createTestAddress(testClient._id);
  });

  // ========== 1. اختبارات إنشاء الطلب ==========
  describe('POST /api/v1/orders', () => {
    it('يجب إنشاء طلب جديد بنجاح', async () => {
      const orderData = {
        items: [
          { name: 'برجر', qty: 2, price: 50 },
          { name: 'بيتزا', qty: 1, price: 80 }
        ],
        totalPrice: 180,
        pickupAddress: testAddress._id,
        deliveryAddress: testAddress._id,
        restaurant: testRestaurant._id,
        notes: 'من فضلك أضف كاتشاب'
      };

      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(orderData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.order).toHaveProperty('status', 'pending');
      expect(response.body.data.order.items).toHaveLength(2);
      expect(response.body.data.order.totalPrice).toBe(180);
      expect(response.body.data.order.notes).toBe(orderData.notes);
    });

    it('يجب رفض إنشاء طلب بدون عناصر', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          totalPrice: 0,
          restaurant: testRestaurant._id
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ========== 2. اختبارات جلب الطلبات ==========
  describe('GET /api/v1/orders/me', () => {
    it('يجب جلب طلبات المستخدم', async () => {
      // إنشاء بعض الطلبات
      for (let i = 0; i < 3; i++) {
        await createTestOrder(testClient._id, testRestaurant._id);
      }

      const response = await request(app)
        .get('/api/v1/orders/me')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
    });
  });

  // ========== 3. اختبارات تحديث حالة الطلب ==========
  describe('PUT /api/v1/orders/:id/status', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await createTestOrder(testClient._id, testRestaurant._id);
      
      // تعيين مندوب للطلب
      testOrder.driver = testDriver._id;
      await testOrder.save();
    });

    it('يجب تحديث حالة الطلب من قبل المندوب', async () => {
      const response = await request(app)
        .put(`/api/v1/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'picked' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.order.status).toBe('picked');
    });

    it('يجب رفض تحديث حالة الطلب من قبل شخص غير مصرح', async () => {
      const response = await request(app)
        .put(`/api/v1/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ status: 'picked' })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('يجب رفض تحديث بحالة غير صالحة', async () => {
      const response = await request(app)
        .put(`/api/v1/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ========== 4. اختبارات إلغاء الطلب ==========
  describe('PUT /api/v1/orders/:id/cancel', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await createTestOrder(testClient._id, testRestaurant._id);
    });

    it('يجب إلغاء الطلب من قبل العميل', async () => {
      const response = await request(app)
        .put(`/api/v1/orders/${testOrder._id}/cancel`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ reason: 'غيرت رأيي' })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      const updatedOrder = await Order.findById(testOrder._id);
      expect(updatedOrder.status).toBe('cancelled');
      expect(updatedOrder.cancellationReason).toBe('غيرت رأيي');
    });

    it('يجب رفض إلغاء طلب بعد قبوله', async () => {
      testOrder.status = 'accepted';
      await testOrder.save();

      const response = await request(app)
        .put(`/api/v1/orders/${testOrder._id}/cancel`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ reason: 'غيرت رأيي' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ========== 5. اختبارات تعيين مندوب ==========
  describe('PUT /api/v1/orders/:id/assign', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await createTestOrder(testClient._id, testRestaurant._id);
    });

    it('يجب تعيين مندوب للطلب من قبل الأدمن', async () => {
      const response = await request(app)
        .put(`/api/v1/orders/${testOrder._id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ driverId: testDriver._id })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      const updatedOrder = await Order.findById(testOrder._id).populate('driver');
      expect(updatedOrder.driver._id.toString()).toBe(testDriver._id.toString());
      expect(updatedOrder.status).toBe('accepted');
    });

    it('يجب رفض تعيين مندوب غير موجود', async () => {
      const fakeId = '123456789012345678901234';
      const response = await request(app)
        .put(`/api/v1/orders/${testOrder._id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ driverId: fakeId })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ========== 6. اختبارات موقع المندوب ==========
  describe('POST /api/v1/orders/:id/location', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await createTestOrder(testClient._id, testRestaurant._id);
      testOrder.driver = testDriver._id;
      await testOrder.save();
    });

    it('يجب تحديث موقع المندوب', async () => {
      const location = {
        latitude: 33.5731,
        longitude: -7.5898
      };

      const response = await request(app)
        .post(`/api/v1/orders/${testOrder._id}/location`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send(location)
        .expect(200);

      expect(response.body.success).toBe(true);

      // التحقق من حفظ الموقع
      const driverLocation = await DriverLocation.findOne({
        driver: testDriver._id,
        order: testOrder._id
      });
      expect(driverLocation).toBeTruthy();
      expect(driverLocation.location.coordinates[0]).toBe(location.longitude);
      expect(driverLocation.location.coordinates[1]).toBe(location.latitude);
    });

    it('يجب رفض تحديث موقع لطلب غير معين للمندوب', async () => {
      const anotherDriver = await createTestUser({
        phone: '+212600000500',
        role: 'driver'
      });
      const anotherToken = generateTestToken(anotherDriver._id, 'driver');

      const response = await request(app)
        .post(`/api/v1/orders/${testOrder._id}/location`)
        .set('Authorization', `Bearer ${anotherToken}`)
        .send({ latitude: 33.5731, longitude: -7.5898 })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});