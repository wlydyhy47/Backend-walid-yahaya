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
const validation = require('./validation.middleware');
const cache = require('./cache.middleware');
const disableCache = require('./disableCache.middleware');

module.exports = {
  auth,
  role,
  errorHandler,
  rateLimiter,
  upload,
  validate,
  validation,
  cache,
  disableCache
};