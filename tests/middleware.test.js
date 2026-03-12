// tests/middleware.test.js
const authMiddleware = require('../src/middlewares/auth.middleware');
const roleMiddleware = require('../src/middlewares/role.middleware');
const rateLimiter = require('../src/middlewares/rateLimit.middleware');
const { AppError } = require('../src/middlewares/errorHandler.middleware');
const jwt = require('jsonwebtoken');
const cache = require('../src/utils/cache.util');

// Mock User model
jest.mock('../src/models/user.model', () => ({
  findById: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn()
    })
  }),
  findByIdAndUpdate: jest.fn().mockResolvedValue({})
}));

const User = require('../src/models/user.model');

// Mock cache
jest.mock('../src/utils/cache.util', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  invalidatePattern: jest.fn()
}));

describe('🛡️ اختبارات الـ Middlewares', () => {
  let req, res, next;
  const userId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    req = global.mockRequest();
    res = global.mockResponse();
    next = global.mockNext;
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
  });

  describe('Auth Middleware', () => {
    it('يجب رفض الطلب بدون توكن', async () => {
      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'NO_TOKEN'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('يجب قبول الطلب بتوكن صالح', async () => {
      const token = jwt.sign(
        { id: userId, role: 'client' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      req.headers.authorization = `Bearer ${token}`;

      const mockLean = jest.fn().mockResolvedValue({
        _id: userId,
        isActive: true,
        role: 'client',
        name: 'Test User',
        isVerified: true
      });
      
      const mockSelect = jest.fn().mockReturnValue({
        lean: mockLean
      });
      
      User.findById.mockReturnValue({
        select: mockSelect
      });

      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(userId);
      expect(User.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('يجب رفض التوكن منتهي الصلاحية', async () => {
      const expiredToken = jwt.sign(
        { id: userId, role: 'client' },
        process.env.JWT_SECRET,
        { expiresIn: '0s' }
      );

      req.headers.authorization = `Bearer ${expiredToken}`;

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(['EXPIRED', 'TOKEN_EXPIRED']).toContain(response.code);
      expect(next).not.toHaveBeenCalled();
    });

    it('يجب رفض المستخدم غير النشط', async () => {
      const token = jwt.sign(
        { id: userId, role: 'client' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      req.headers.authorization = `Bearer ${token}`;

      const mockLean = jest.fn().mockResolvedValue({
        _id: userId,
        isActive: false,
        role: 'client',
        name: 'Test User'
      });
      
      const mockSelect = jest.fn().mockReturnValue({
        lean: mockLean
      });
      
      User.findById.mockReturnValue({
        select: mockSelect
      });

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'ACCOUNT_DEACTIVATED'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Role Middleware', () => {
    it('يجب السماح للمستخدم بالدور الصحيح', () => {
      req.user = { role: 'admin' };

      const middleware = roleMiddleware('admin');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('يجب رفض المستخدم بالدور الخاطئ', () => {
      req.user = { role: 'client' };

      const middleware = roleMiddleware('admin');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'FORBIDDEN'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('يجب قبول أدوار متعددة', () => {
      req.user = { role: 'driver' };

      const middleware = roleMiddleware('admin', 'driver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Rate Limiter', () => {
    it('يجب إنشاء limiters بشكل صحيح', () => {
      expect(rateLimiter.authLimiter).toBeDefined();
      expect(rateLimiter.apiLimiter).toBeDefined();
      expect(rateLimiter.strictLimiter).toBeDefined();
      expect(rateLimiter.uploadLimiter).toBeDefined();
      expect(rateLimiter.searchLimiter).toBeDefined();
    });

    it('يجب تنسيق TTL بشكل صحيح', () => {
      expect(rateLimiter.formatTTL(3600)).toContain('ساعة');
      expect(rateLimiter.formatTTL(60)).toContain('دقيقة');
      expect(rateLimiter.formatTTL(30)).toContain('ثانية');
    });
  });

  describe('Error Handler', () => {
    const { errorHandler } = require('../src/middlewares/errorHandler.middleware');

    it('يجب معالجة AppError بشكل صحيح', () => {
      const error = new AppError('خطأ متوقع', 400, 'TEST_ERROR');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'خطأ متوقع',
          code: 'TEST_ERROR'
        })
      );
    });

    it('يجب معالجة أخطاء Mongoose', () => {
      const error = {
        name: 'ValidationError',
        errors: {
          field: { message: 'حقل مطلوب' }
        }
      };

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'VALIDATION_ERROR'
        })
      );
    });

    it('يجب معالجة أخطاء CastError', () => {
      const error = {
        name: 'CastError',
        path: '_id',
        value: 'invalid-id'
      };

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_ID'
        })
      );
    });

    it('يجب معالجة أخطاء JWT', () => {
      const error = {
        name: 'JsonWebTokenError',
        message: 'invalid token'
      };

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_TOKEN'
        })
      );
    });
  });
});