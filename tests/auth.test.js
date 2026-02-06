const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/user.model');

describe('Authentication API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const userData = {
        name: 'Test User',
        phone: '+1234567890',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.user).toHaveProperty('phone', userData.phone);
    });

    it('should not register with duplicate phone', async () => {
      const userData = {
        name: 'Test User',
        phone: '+1234567890',
        password: 'password123'
      };

      // Create first user
      await request(app).post('/api/auth/register').send(userData);

      // Try to create duplicate
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await User.create({
        name: 'Test User',
        phone: '+1234567890',
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMy.MrqK.3.6Z6C.YGVmZ7yT7K7Ql.9.9mW' // password123
      });
    });

    it('should login with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          phone: '+1234567890',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
    });

    it('should not login with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          phone: '+1234567890',
          password: 'wrongpassword'
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });
});