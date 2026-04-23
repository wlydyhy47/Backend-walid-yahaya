// ============================================
// ملف: src/services/index.js
// ============================================

const notificationService = require('./notification.service');
const emailService = require('./email.service');
const smsService = require('./sms.service');
const fileService = require('./file.service');
const assetService = require('./asset.service');
const socketService = require('./socket.service');
const performanceService = require('./performance.service');
const healthCheckService = require('./healthCheck.service');
const mapboxService = require('./mapbox.service');
const otpService = require('./otp.service');

module.exports = {
  notificationService,
  emailService,
  smsService,
  fileService,
  assetService,
  socketService,
  performanceService,
  healthCheckService,
  mapboxService,
  otpService
};