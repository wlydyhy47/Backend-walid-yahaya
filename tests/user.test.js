// ============================================
// ملف: tests/user.test.js
// الوصف: اختبارات المستخدمين
// ============================================
// في بداية كل ملف اختبار
const { createTestUser, generateTestToken, createTestRestaurant, createTestOrder, createTestAddress, createTestItem } = global;
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/user.model');

describe('👤 اختبارات المستخدمين (Users)', () => {
  let userToken;
  let adminToken;
  let testUser;
  let testAdmin;

  beforeEach(async () => {
    // إنشاء مستخدم عادي
    testUser = await createTestUser({
      phone: '+212600000100',
      role: 'client'
    });
    userToken = generateTestToken(testUser._id, 'client');

    // إنشاء أدمن
    testAdmin = await createTestUser({
      phone: '+212600000101',
      role: 'admin'
    });
    adminToken = generateTestToken(testAdmin._id, 'admin');
  });

  // ========== 1. اختبارات الملف الشخصي ==========
  describe('GET /api/v1/users/me', () => {
    it('يجب جلب الملف الشخصي للمستخدم', async () => {
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('name', testUser.name);
      expect(response.body.data).toHaveProperty('phone', testUser.phone);
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('يجب رفض جلب الملف الشخصي بدون توكن', async () => {
      await request(app)
        .get('/api/v1/users/me')
        .expect(401);
    });
  });

  // ========== 2. اختبارات تحديث الملف الشخصي ==========
  describe('PUT /api/v1/users/me', () => {
    it('يجب تحديث الملف الشخصي بنجاح', async () => {
      const updates = {
        name: 'أحمد محمد الجديد',
        email: 'ahmed.new@example.com',
        bio: 'هذه سيرة ذاتية جديدة'
      };

      const response = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('name', updates.name);
      expect(response.body.data).toHaveProperty('email', updates.email);
      expect(response.body.data).toHaveProperty('bio', updates.bio);
    });

    it('يجب رفض تحديث رقم الهاتف', async () => {
      const response = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ phone: '+212699999999' })
        .expect(200);

      // يجب أن يبقى رقم الهاتف كما هو
      expect(response.body.data.phone).toBe(testUser.phone);
    });
  });

  // ========== 3. اختبارات تغيير كلمة المرور ==========
  describe('PUT /api/v1/users/me/password', () => {
    it('يجب تغيير كلمة المرور بنجاح', async () => {
      const response = await request(app)
        .put('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // التحقق من إمكانية تسجيل الدخول بكلمة المرور الجديدة
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          phone: testUser.phone,
          password: 'NewPassword123'
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
    });

    it('يجب رفض تغيير كلمة المرور بكلمة مرور حالية خاطئة', async () => {
      const response = await request(app)
        .put('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('غير صحيحة');
    });

    it('يجب رفض تغيير كلمة المرور إذا لم يتطابق التأكيد', async () => {
      const response = await request(app)
        .put('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'NewPassword123',
          confirmPassword: 'DifferentPassword'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ========== 4. اختبارات الملف الشخصي الكامل ==========
  describe('GET /api/v1/users/me/complete', () => {
    it('يجب جلب الملف الشخصي الكامل مع الإحصائيات', async () => {
      // إنشاء بعض البيانات للمستخدم
      const restaurant = await createTestRestaurant();
      await createTestOrder(testUser._id, restaurant._id);
      await createTestAddress(testUser._id);

      const response = await request(app)
        .get('/api/v1/users/me/complete')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('addresses');
      expect(response.body.data).toHaveProperty('recentOrders');
      expect(response.body.data).toHaveProperty('stats');
    });
  });

  // ========== 5. اختبارات المفضلة ==========
  describe('POST /api/v1/users/me/favorites/:restaurantId', () => {
    let restaurant;

    beforeEach(async () => {
      restaurant = await createTestRestaurant();
    });

    it('يجب إضافة مطعم للمفضلة', async () => {
      const response = await request(app)
        .post(`/api/v1/users/me/favorites/${restaurant._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(201);

      expect(response.body.success).toBe(true);
      
      // التحقق من الإضافة
      const user = await User.findById(testUser._id);
      expect(user.favorites).toContainEqual(restaurant._id);
    });

    it('يجب إزالة مطعم من المفضلة', async () => {
      // إضافة أولاً
      await request(app)
        .post(`/api/v1/users/me/favorites/${restaurant._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      // ثم إزالة
      const response = await request(app)
        .delete(`/api/v1/users/me/favorites/${restaurant._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // التحقق من الإزالة
      const user = await User.findById(testUser._id);
      expect(user.favorites).not.toContainEqual(restaurant._id);
    });
  });
});