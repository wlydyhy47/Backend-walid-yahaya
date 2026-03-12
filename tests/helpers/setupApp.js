// tests/helpers/setupApp.js
const app = require('../../src/app');
const request = require('supertest');

/**
 * تهيئة السيرفر للاختبارات
 * هذه الدالة تضمن تحميل جميع المسارات قبل البدء
 */
const setupApp = async () => {
  // هذا السطر يجبر Express على إنشاء _router
  await request(app).get('/');
  
  // انتظر قليلاً للتأكد
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return app;
};

module.exports = setupApp;