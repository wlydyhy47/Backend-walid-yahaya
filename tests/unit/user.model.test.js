const mongoose = require('mongoose');
const User = require('../../src/models/user.model');
const { users } = require('../fixtures/user.fixture');

describe('User Model Unit Tests', () => {
  describe('User Validation', () => {
    let newUser;
    beforeEach(() => {
      newUser = {
        name: 'Test Setup User',
        email: 'test@example.com',
        phone: '+12345678000',
        password: 'password123',
        role: 'client'
      };
    });

    it('should correctly validate a valid user', async () => {
      await expect(new User(newUser).validate()).resolves.toBeUndefined();
    });

    it('should throw validation error if phone is invalid', async () => {
      newUser.phone = 'invalid-phone-string';
      await expect(new User(newUser).validate()).rejects.toThrow();
    });

    it('should throw validation error if email is invalid', async () => {
      newUser.email = 'invalidEmail';
      await expect(new User(newUser).validate()).rejects.toThrow();
    });
  });

  describe('User Virtuals', () => {
    it('loyaltyTier should correctly identify tier based on loyaltyPoints', () => {
      const user = new User({ loyaltyPoints: 400 });
      expect(user.loyaltyTier).toBe('bronze');

      user.loyaltyPoints = 600;
      expect(user.loyaltyTier).toBe('silver');

      user.loyaltyPoints = 2500;
      expect(user.loyaltyTier).toBe('gold');

      user.loyaltyPoints = 5500;
      expect(user.loyaltyTier).toBe('platinum');
    });

    it('age should correctly calculate age from dateOfBirth', () => {
      const user = new User({ 
        dateOfBirth: new Date(new Date().setFullYear(new Date().getFullYear() - 25))
      });
      // Accounting for leap days / exact dates might make it off by 1 depending on today's date vs exact birthdate in the JS setFullYear
      expect(user.age).toBeGreaterThanOrEqual(24);
      expect(user.age).toBeLessThanOrEqual(25);
    });
    
    it('isLocked should be accurately identified based on lockUntil', () => {
      const user = new User();
      expect(user.isLocked).toBe(false);
      
      user.lockUntil = new Date(Date.now() + 100000);
      expect(user.isLocked).toBe(true);
      
      user.lockUntil = new Date(Date.now() - 100000);
      expect(user.isLocked).toBe(false);
    });
  });

  describe('User Instance Methods', () => {
    it('addLoyaltyPoints should correctly increment points and record transaction', async () => {
      // Create user and save to in-memory db
      const user = await User.create({
        name: 'Loyalty User',
        phone: '+9999999999',
        password: 'password123',
        loyaltyPoints: 100
      });

      const updatedPoints = await user.addLoyaltyPoints(50, 'Completed Order');
      
      expect(updatedPoints).toBe(150);
      expect(user.loyaltyPoints).toBe(150);
      expect(user.loyaltyTransactions.length).toBe(1);
      expect(user.loyaltyTransactions[0].amount).toBe(50);
      expect(user.loyaltyTransactions[0].type).toBe('earn');
      expect(user.loyaltyTransactions[0].balance).toBe(150);
    });

    it('redeemLoyaltyPoints should correctly decrement points', async () => {
      const user = await User.create({
        name: 'Redeem User',
        phone: '+8888888888',
        password: 'password123',
        loyaltyPoints: 500
      });

      const updatedPoints = await user.redeemLoyaltyPoints(200, 'Discount specific');
      
      expect(updatedPoints).toBe(300);
      expect(user.loyaltyPoints).toBe(300);
      expect(user.loyaltyTransactions.length).toBe(1);
      expect(user.loyaltyTransactions[0].amount).toBe(200);
      expect(user.loyaltyTransactions[0].type).toBe('redeem');
    });

    it('redeemLoyaltyPoints should throw if insufficient points', async () => {
      const user = await User.create({
        name: 'Poor User',
        phone: '+7777777777',
        password: 'password123',
        loyaltyPoints: 100
      });

      await expect(user.redeemLoyaltyPoints(200, 'Discount')).rejects.toThrow('Insufficient points');
    });
  });
});
