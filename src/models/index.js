// ============================================
// ملف: src/models/index.js
// الوصف: تجميع وتصدير جميع الموديلات
// ============================================

const User = require('./user.model');
const Store = require('./store.model');
const StoreAddress = require('./storeAddress.model');
const Product = require('./product.model');
const Order = require('./order.model');
const Address = require('./address.model');
const Review = require('./review.model');
const Favorite = require('./favorite.model');
const Notification = require('./notification.model');
const Conversation = require('./conversation.model');
const Message = require('./message.model');
const Device = require('./device.model');
const DriverLocation = require('./driverLocation.model');
const Loyalty = require('./loyalty.model');
const LoyaltyReward = require('./loyaltyReward.model');
const Analytics = require('./analytics.model');
const RefreshToken = require('./refreshToken.model');

module.exports = {
  User,
  Store,
  StoreAddress,
  Product,
  Order,
  Address,
  Review,
  Favorite,
  Notification,
  Conversation,
  Message,
  Device,
  DriverLocation,
  Loyalty,
  LoyaltyReward,
  Analytics,
  RefreshToken
};