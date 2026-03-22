// ============================================
// ملف: src/validators/index.js
// الوصف: تجميع جميع الـ Validators
// ============================================

module.exports = {
  // Auth Validators
  ...require('./auth.validator'),
  
  // User Validators
  ...require('./user.validator'),
  
  // Order Validators
  ...require('./order.validator'),
  
  // Address Validators
  ...require('./address.validator'),
  
  // Store Validators
  ...require('./store.validator'),
  
  // Product Validators
  ...require('./product.validator')
};