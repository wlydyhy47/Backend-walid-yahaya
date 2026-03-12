// tests/auth.test.js - النسخة النهائية
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/user.model');
const RefreshToken = require('../src/models/refreshToken.model');
const jwt = require('jsonwebtoken'); // ✅ إضافة هذا السطر المهم
const bcrypt = require('bcryptjs');

// للتشخيص - طباعة جميع المسارات المسجلة
beforeAll(async () => {
  const listRoutes = (stack) => {
    const routes = [];
    stack.forEach(layer => {
      if (layer.route) {
        routes.push({
          method: Object.keys(layer.route.methods)[0].toUpperCase(),
          path: layer.route.path
        });
      }
    });
    console.log('📋 المسارات المسجلة:', routes);
  };

  // هذا سيطبع المسارات المتاحة
  if (app._router && app._router.stack) {
    listRoutes(app._router.stack);
  }
});

describe('🔐 اختبارات المصادقة (Auth)', () => {
  
  // تأكد من تحميل جميع المسارات قبل الاختبارات
  beforeAll(async () => {
    // هذا السطر يجبر Express على تهيئة جميع المسارات
    await request(app).get('/');
    // انتظر قليلاً للتأكد
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  describe('POST /api/v1/auth/register', () => {
    it('يجب تسجيل مستخدم جديد بنجاح', async () => {
      const userData = {
        name: 'أحمد محمد',
        phone: '+212600000001',
        password: 'Password123',
        email: 'ahmed@example.com'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData);

      // طباعة الاستجابة للتشخيص
      console.log('Register response:', response.status, response.body);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty('name', userData.name);
      expect(response.body.data.user).not.toHaveProperty('password');
      
      const user = await User.findOne({ phone: userData.phone });
      expect(user).toBeTruthy();
      expect(user.name).toBe(userData.name);
    });

    it('يجب رفض التسجيل برقم هاتف مكرر', async () => {
      const userData = {
        name: 'أحمد محمد',
        phone: '+212600000002',
        password: 'Password123'
      };

      // إنشاء المستخدم الأول
      await request(app)
        .post('/api/v1/auth/register')
        .send(userData);

      // محاولة إنشاء مستخدم بنفس الرقم
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('موجود');
    });

    it('يجب رفض التسجيل بكلمة مرور ضعيفة', async () => {
      const userData = {
        name: 'أحمد محمد',
        phone: '+212600000003',
        password: '123' // كلمة مرور قصيرة جداً
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('كلمة المرور');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await User.create({
        name: 'مستخدم اختبار',
        phone: '+212600000010',
        password: await bcrypt.hash('Password123', 10),
        role: 'client',
        isVerified: true,
        isActive: true
      });
    });

    it('يجب تسجيل الدخول بنجاح ببيانات صحيحة', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          phone: '+212600000010',
          password: 'Password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user).toHaveProperty('phone', '+212600000010');
    });

    it('يجب رفض تسجيل الدخول بكلمة مرور خاطئة', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          phone: '+212600000010',
          password: 'WrongPassword'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('غير صحيحة');
    });

    it('يجب رفض تسجيل الدخول برقم هاتف غير موجود', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          phone: '+212699999999',
          password: 'Password123'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    let refreshToken;
    let user;

    beforeEach(async () => {
      user = await User.create({
        name: 'مستخدم اختبار',
        phone: '+212600000020',
        password: await bcrypt.hash('Password123', 10),
        role: 'client',
        isVerified: true,
        isActive: true
      });
      
      refreshToken = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      await RefreshToken.create({
        token: refreshToken,
        user: user._id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    });

    it('يجب تجديد التوكن بنجاح', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('يجب رفض تجديد التوكن بتوكن غير صالح', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let accessToken;
    let refreshToken;
    let user;

    beforeEach(async () => {
      user = await User.create({
        name: 'مستخدم اختبار',
        phone: '+212600000030',
        password: await bcrypt.hash('Password123', 10),
        role: 'client',
        isVerified: true,
        isActive: true
      });
      
      accessToken = jwt.sign(
        { id: user._id, role: 'client' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      refreshToken = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      await RefreshToken.create({
        token: refreshToken,
        user: user._id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    });

    it('يجب تسجيل الخروج بنجاح', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
      expect(tokenDoc.revokedAt).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    let accessToken;
    let user;

    beforeEach(async () => {
      user = await User.create({
        name: 'مستخدم اختبار',
        phone: '+212600000040',
        password: await bcrypt.hash('oldPassword123', 10),
        role: 'client',
        isVerified: true,
        isActive: true
      });
      
      accessToken = jwt.sign(
        { id: user._id, role: 'client' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    });

    it('يجب تغيير كلمة المرور بنجاح', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('يجب رفض تغيير كلمة المرور بكلمة مرور حالية خاطئة', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'wrongPassword',
          newPassword: 'NewPassword123'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('يجب رفض تغيير كلمة المرور بكلمة مرور جديدة ضعيفة', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'oldPassword123',
          newPassword: '123'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/auth/validate', () => {
    let validToken;
    let user;

    beforeEach(async () => {
      user = await User.create({
        name: 'مستخدم اختبار',
        phone: '+212600000050',
        password: await bcrypt.hash('Password123', 10),
        role: 'client',
        isVerified: true,
        isActive: true
      });
      
      validToken = jwt.sign(
        { id: user._id, role: 'client' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    });

    it('يجب التحقق من صحة التوكن', async () => {
      const response = await request(app)
        .get('/api/v1/auth/validate')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
    });

    it('يجب رفض التوكن منتهي الصلاحية', async () => {
      const expiredToken = jwt.sign(
        { id: user._id, role: 'client' },
        process.env.JWT_SECRET,
        { expiresIn: '0s' }
      );

      const response = await request(app)
        .get('/api/v1/auth/validate')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});