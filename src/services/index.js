// ============================================
// ملف: src/services/index.js
// الوصف: تجميع وتصدير جميع الخدمات
// ============================================

const notificationService = require('./notification.service');
const emailService = require('./email.service');
const smsService = require('./sms.service');
const fileService = require('./file.service');
const assetService = require('./asset.service');
const socketService = require('./socket.service');
const performanceService = require('./performance.service');
const healthCheckService = require('./healthCheck.service');
const mapboxService = require('./mapbox.service');  // ✅ إضافة mapboxService

module.exports = {
  notificationService,
  emailService,
  smsService,
  fileService,
  assetService,
  socketService,
  performanceService,
  healthCheckService,
  mapboxService  // ✅ تصدير mapboxService
};