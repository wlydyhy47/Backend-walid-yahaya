const roleMiddleware = require('../../src/middlewares/role.middleware');
const User = require('../../src/models/user.model');
const { users } = require('../fixtures/user.fixture');

jest.mock('../../src/models/user.model');
jest.mock('../../src/models/store.model', () => ({})); // Mock to prevent errors
jest.mock('../../src/utils/logger.util', () => ({
  businessLogger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Role Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { user: null, params: {}, body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('roleMiddleware(...allowedRoles)', () => {
    it('should block unauthenticated requests (no req.user)', () => {
      const middleware = roleMiddleware('admin');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should block users without the required role', () => {
      req.user = { role: 'client', id: users.client._id };
      const middleware = roleMiddleware('admin', 'driver');

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'FORBIDDEN'
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow users with a required role', () => {
      req.user = { role: 'admin', id: users.admin._id };
      const middleware = roleMiddleware('admin', 'vendor');

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('hasPermission(permission)', () => {
    it('should allow if user role has the required permission', () => {
      req.user = { role: 'client', id: users.client._id };
      const middleware = roleMiddleware.hasPermission('create_orders');

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should block if user role lacks the required permission', () => {
      req.user = { role: 'client', id: users.client._id };
      const middleware = roleMiddleware.hasPermission('manage_users');

      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('storeOwnerMiddleware', () => {
    it('should allow admins without checking store ownership', async () => {
      req.user = { role: 'admin', id: users.admin._id };

      await roleMiddleware.storeOwnerMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should block non-store-owners', async () => {
      req.user = { role: 'client', id: users.client._id };

      await roleMiddleware.storeOwnerMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow store owners with a linked store', async () => {
      req.user = { role: 'vendor', id: users.storeOwner._id };
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(users.storeOwner)
      });

      await roleMiddleware.storeOwnerMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.storeId).toBeDefined();
    });
  });
});
