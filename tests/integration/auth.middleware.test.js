const authMiddleware = require('../../src/middlewares/auth.middleware');
const User = require('../../src/models/user.model');
const cache = require('../../src/utils/cache.util');
const { users, generateToken } = require('../fixtures/user.fixture');

// Mock dependencies
jest.mock('../../src/models/user.model');
jest.mock('../../src/utils/cache.util');
jest.mock('../../src/utils/logger.util', () => ({
  businessLogger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      ip: '127.0.0.1',
      originalUrl: '/api/test'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
    
    // Default mocks
    cache.get.mockResolvedValue(null); // Not blacklisted
    User.findByIdAndUpdate = jest.fn().mockResolvedValue({});
  });

  it('should return 401 if no token is provided', async () => {
    await authMiddleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'NO_TOKEN'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if token is invalid format', async () => {
    req.headers.authorization = 'Bearer invalid.token.format.here';
    
    await authMiddleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'INVALID_TOKEN_FORMAT'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if token is blacklisted', async () => {
    const token = generateToken(users.client._id);
    req.headers.authorization = `Bearer ${token}`;
    cache.get.mockResolvedValueOnce(true); // Blacklisted
    
    await authMiddleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'TOKEN_REVOKED'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if user does not exist', async () => {
    const token = generateToken(users.client._id);
    req.headers.authorization = `Bearer ${token}`;
    
    // Mock user not found
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      })
    });
    
    await authMiddleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'USER_NOT_FOUND'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if account is deactivated', async () => {
    const user = users.deactivated;
    const token = generateToken(user._id);
    req.headers.authorization = `Bearer ${token}`;
    
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(user)
      })
    });
    
    await authMiddleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'ACCOUNT_DEACTIVATED'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() and attach user to req for valid token', async () => {
    const user = users.client;
    const token = generateToken(user._id);
    req.headers.authorization = `Bearer ${token}`;
    
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(user)
      })
    });
    
    await authMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(user._id);
    expect(req.user.role).toBe(user.role);
    expect(req.auth.authenticated).toBe(true);
  });
});
