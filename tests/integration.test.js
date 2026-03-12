// ============================================
// ملف: tests/integration.test.js
// الوصف: اختبارات التكامل الشاملة
// ============================================
// في بداية كل ملف اختبار
const { createTestUser, generateTestToken, createTestRestaurant, createTestOrder, createTestAddress, createTestItem } = global;
const request = require('supertest');
const app = require('../src/app');

describe('🔄 اختبارات التكامل (Integration)', () => {
  let userToken;
  let adminToken;
  let testUser;
  let testRestaurant;
  let testOrder;

  beforeEach(async () => {
    // إنشاء المستخدمين
    testUser = await createTestUser({
      phone: '+212600000700',
      role: 'client'
    });
    userToken = generateTestToken(testUser._id, 'client');

    const admin = await createTestUser({
      phone: '+212600000701',
      role: 'admin'
    });
    adminToken = generateTestToken(admin._id, 'admin');

    // إنشاء مطعم
    testRestaurant = await createTestRestaurant({
      name: 'مطعم التكامل',
      createdBy: admin._id
    });

    // إنشاء عنوان
    await createTestAddress(testUser._id);
  });

  // ========== 1. سيناريو: طلب كامل ==========
  describe('سيناريو طلب كامل', () => {
    it('يجب إكمال دورة حياة الطلب بنجاح', async () => {
      // 1. البحث عن مطاعم
      const searchResponse = await request(app)
        .get(`/api/v1/restaurants/search?name=${testRestaurant.name}`)
        .expect(200);

      expect(searchResponse.body.data).toHaveLength(1);
      const restaurant = searchResponse.body.data[0];

      // 2. الحصول على تفاصيل المطعم
      const detailsResponse = await request(app)
        .get(`/api/v1/restaurants/${restaurant._id}/details`)
        .expect(200);

      expect(detailsResponse.body.data.name).toBe(testRestaurant.name);

      // 3. إنشاء طلب
      const address = (await request(app)
        .get('/api/v1/addresses/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)).body.data[0];

      const orderData = {
        items: [
          { name: 'برجر', qty: 2, price: 50 },
          { name: 'بطاطا', qty: 1, price: 25 }
        ],
        totalPrice: 125,
        pickupAddress: address._id,
        deliveryAddress: address._id,
        restaurant: restaurant._id
      };

      const orderResponse = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send(orderData)
        .expect(201);

      testOrder = orderResponse.body.data.order;

      // 4. جلب الطلبات
      const ordersResponse = await request(app)
        .get('/api/v1/orders/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(ordersResponse.body.data).toHaveLength(1);

      // 5. إلغاء الطلب
      const cancelResponse = await request(app)
        .put(`/api/v1/orders/${testOrder._id}/cancel`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ reason: 'اختبار الإلغاء' })
        .expect(200);

      expect(cancelResponse.body.success).toBe(true);
    });
  });

  // ========== 2. سيناريو: تقييم مطعم ==========
  describe('سيناريو تقييم مطعم', () => {
    it('يجب إضافة تقييم بعد طلب مكتمل', async () => {
      // 1. إنشاء طلب مكتمل
      const order = await createTestOrder(
        testUser._id,
        testRestaurant._id,
        { status: 'delivered' }
      );

      // 2. إضافة تقييم
      const reviewResponse = await request(app)
        .post(`/api/v1/restaurants/${testRestaurant._id}/reviews`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          rating: 5,
          comment: 'مطعم رائع'
        })
        .expect(201);

      expect(reviewResponse.body.success).toBe(true);

      // 3. التحقق من تحديث متوسط التقييمات
      const restaurantResponse = await request(app)
        .get(`/api/v1/restaurants/${testRestaurant._id}/details`)
        .expect(200);

      expect(restaurantResponse.body.data.averageRating).toBe(5);
      expect(restaurantResponse.body.data.ratingsCount).toBe(1);
    });
  });

  // ========== 3. سيناريو: إدارة المفضلة ==========
  describe('سيناريو إدارة المفضلة', () => {
    it('يجب إضافة وإزالة مطعم من المفضلة', async () => {
      // 1. إضافة للمفضلة
      const addResponse = await request(app)
        .post(`/api/v1/users/me/favorites/${testRestaurant._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(201);

      expect(addResponse.body.success).toBe(true);

      // 2. جلب المفضلة
      const favoritesResponse = await request(app)
        .get('/api/v1/users/me/favorites')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(favoritesResponse.body.favorites).toHaveLength(1);

      // 3. إزالة من المفضلة
      const removeResponse = await request(app)
        .delete(`/api/v1/users/me/favorites/${testRestaurant._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(removeResponse.body.success).toBe(true);

      // 4. التحقق من الإزالة
      const finalResponse = await request(app)
        .get('/api/v1/users/me/favorites')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(finalResponse.body.favorites).toHaveLength(0);
    });
  });
});