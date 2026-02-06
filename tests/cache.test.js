// tests/cache.test.js
const cache = require('../src/utils/cache.util');

describe('Cache Service', () => {
  beforeEach(() => {
    cache.flush();
  });

  test('should set and get value', async () => {
    cache.set('test-key', 'test-value');
    const value = cache.get('test-key');
    expect(value).toBe('test-value');
  });

  test('should invalidate by pattern', async () => {
    cache.set('user:1:profile', { name: 'John' });
    cache.set('user:2:profile', { name: 'Jane' });
    cache.set('order:123', { id: 123 });
    
    const removed = cache.invalidatePattern('user:*');
    expect(removed).toBe(2);
    expect(cache.get('user:1:profile')).toBeUndefined();
    expect(cache.get('order:123')).toBeDefined();
  });
});

// tests/validation.test.js
const { validateRegister } = require('../src/middlewares/validation.middleware');

describe('Validation Middleware', () => {
  test('should validate register data correctly', () => {
    const req = {
      body: {
        name: 'John',
        phone: '+1234567890',
        password: 'password123',
        email: 'john@example.com'
      }
    };
    
    const res = {};
    const next = jest.fn();
    
    validateRegister(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});