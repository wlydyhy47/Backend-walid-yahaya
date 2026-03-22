// ============================================
// ملف: src/middlewares/index.js
// الوصف: تجميع وتصدير جميع الـ Middlewares
// ============================================

const auth = require('./auth.middleware');
const role = require('./role.middleware');
const errorHandler = require('./errorHandler.middleware');
const rateLimiter = require('./rateLimit.middleware');
const upload = require('./upload');
const validate = require('./validate.middleware');
const cache = require('./cache.middleware');
const disableCache = require('./disableCache.middleware');
const map = require('./map.middleware'); // ✅ إضافة middleware الخرائط

module.exports = {
  auth,
  role,
  errorHandler,
  rateLimiter,
  upload,
  validate,
  cache,
  disableCache,
  map  // ✅ تصدير map middleware
};