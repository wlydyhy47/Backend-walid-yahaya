// tests/setup.js - نسخة محدثة
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// في tests/setup.js - قبل الاختبارات
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.NODE_ENV = 'test';
process.env.API_URL = 'http://localhost:3000';

let mongoServer;

// إضافة الدوال المساعدة المفقودة
global.formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days} يوم`);
  if (hours > 0) parts.push(`${hours} ساعة`);
  if (minutes > 0) parts.push(`${minutes} دقيقة`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} ثانية`);

  return parts.join(' ');
};

global.calculateETA = (order) => {
  if (!order) return 'غير معروف';
  
  const now = new Date();
  const created = new Date(order.createdAt);
  const elapsedMinutes = Math.floor((now - created) / 60000);
  
  const baseTime = order.estimatedDeliveryTime || 30;
  const remaining = Math.max(0, baseTime - elapsedMinutes);
  
  const statusTimes = {
    pending: `${baseTime} دقيقة`,
    accepted: `${Math.max(5, remaining)} دقيقة`,
    picked: `${Math.max(2, remaining - 10)} دقيقة`,
    delivered: 'تم التوصيل',
    cancelled: 'ملغي'
  };
  
  return statusTimes[order.status] || 'قيد الحساب';
};

global.createOrderTimeline = (order) => {
  return [
    {
      status: 'created',
      title: 'تم إنشاء الطلب',
      timestamp: order.createdAt,
      completed: true
    },
    {
      status: 'accepted',
      title: 'تم قبول الطلب',
      timestamp: order.status !== 'pending' ? order.updatedAt : null,
      completed: ['accepted', 'picked', 'delivered'].includes(order.status)
    },
    {
      status: 'picked',
      title: 'تم الاستلام من المطعم',
      timestamp: ['picked', 'delivered'].includes(order.status) ? order.updatedAt : null,
      completed: ['picked', 'delivered'].includes(order.status)
    },
    {
      status: 'delivered',
      title: 'تم التوصيل',
      timestamp: order.status === 'delivered' ? order.updatedAt : null,
      completed: order.status === 'delivered'
    }
  ];
};

// قبل كل الاختبارات
beforeAll(async () => {
  // إنشاء خادم MongoDB في الذاكرة
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // ✅ الإصدار المحدث - بدون الخيارات القديمة
  await mongoose.connect(mongoUri);

  // تعيين متغيرات البيئة
  process.env.JWT_SECRET = 'test-secret-key';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  process.env.NODE_ENV = 'test';
  process.env.CLOUDINARY_CLOUD_NAME = 'test';
  process.env.CLOUDINARY_API_KEY = 'test';
  process.env.CLOUDINARY_API_SECRET = 'test';
  process.env.REDIS_ENABLED = 'false';
  process.env.EMAIL_ENABLED = 'false';
  process.env.SMS_ENABLED = 'false';
});

// قبل كل اختبار
beforeEach(async () => {
  // مسح جميع المجموعات
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany();
  }
});

// بعد كل الاختبارات
afterAll(async () => {
  // قطع الاتصال
  await mongoose.disconnect();
  await mongoServer.stop();
});

// دوال مساعدة للاختبارات
global.generateTestToken = (userId = '123456789012345678901234', role = 'client') => {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

global.generateExpiredToken = (userId = '123456789012345678901234', role = 'client') => {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: '0s' }
  );
};

global.createTestUser = async (overrides = {}) => {
  const User = require('../src/models/user.model');
  
  const defaultUser = {
    name: 'مستخدم اختبار',
    phone: '+212600000000',
    password: await bcrypt.hash('password123', 10),
    role: 'client',
    isVerified: true,
    isActive: true,
    email: 'test@example.com',
    loyaltyPoints: 0
  };

  const userData = { ...defaultUser, ...overrides };
  const user = await User.create(userData);
  return user;
};

global.createTestRestaurant = async (overrides = {}) => {
  const Restaurant = require('../src/models/restaurant.model');
  
  const defaultRestaurant = {
    name: 'مطعم اختبار',
    description: 'وصف المطعم',
    type: 'restaurant',
    isOpen: true,
    deliveryFee: 10,
    minOrderAmount: 50,
    estimatedDeliveryTime: 30
  };

  const restaurantData = { ...defaultRestaurant, ...overrides };
  const restaurant = await Restaurant.create(restaurantData);
  return restaurant;
};

global.createTestOrder = async (userId, restaurantId, overrides = {}) => {
  const Order = require('../src/models/order.model');
  
  const defaultOrder = {
    user: userId,
    restaurant: restaurantId,
    items: [
      { name: 'برجر', qty: 2, price: 50, category: 'main' },
      { name: 'بيتزا', qty: 1, price: 80, category: 'main' }
    ],
    totalPrice: 180,
    status: 'pending',
    estimatedDeliveryTime: 30
  };

  const orderData = { ...defaultOrder, ...overrides };
  const order = await Order.create(orderData);
  return order;
};

global.createTestAddress = async (userId, overrides = {}) => {
  const Address = require('../src/models/address.model');
  
  const defaultAddress = {
    user: userId,
    label: 'Home',
    addressLine: 'شارع الحسن الثاني، رقم 10',
    city: 'الدار البيضاء',
    isDefault: true
  };

  const addressData = { ...defaultAddress, ...overrides };
  const address = await Address.create(addressData);
  return address;
};

global.createTestItem = async (restaurantId, overrides = {}) => {
  const Item = require('../src/models/item.model');
  
  const defaultItem = {
    name: 'برجر دجاج',
    price: 45,
    description: 'برجر دجاج مقلي',
    category: 'main',
    restaurant: restaurantId,
    isAvailable: true
  };

  const itemData = { ...defaultItem, ...overrides };
  const item = await Item.create(itemData);
  return item;
};

global.createTestReview = async (userId, restaurantId, overrides = {}) => {
  const Review = require('../src/models/review.model');
  
  const defaultReview = {
    user: userId,
    restaurant: restaurantId,
    rating: 4,
    comment: 'تقييم ممتاز'
  };

  const reviewData = { ...defaultReview, ...overrides };
  const review = await Review.create(reviewData);
  return review;
};

global.createTestNotification = async (userId, overrides = {}) => {
  const Notification = require('../src/models/notification.model');
  
  const defaultNotification = {
    user: userId,
    type: 'system',
    title: 'إشعار اختبار',
    content: 'محتوى الإشعار',
    priority: 'medium',
    status: 'unread'
  };

  const notificationData = { ...defaultNotification, ...overrides };
  const notification = await Notification.create(notificationData);
  return notification;
};

global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

global.mockRequest = (options = {}) => {
  const req = {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    ip: '127.0.0.1',
    get: (header) => req.headers[header.toLowerCase()],
    ...options
  };
  return req;
};

global.mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
};

global.mockNext = jest.fn();

global.getStatusText = (status) => {
  const statusTexts = {
    pending: 'قيد الانتظار',
    accepted: 'تم القبول',
    picked: 'تم الاستلام',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي'
  };
  return statusTexts[status] || 'غير معروف';
};