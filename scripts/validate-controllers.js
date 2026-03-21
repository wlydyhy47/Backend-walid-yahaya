// ============================================
// ملف: scripts/validate-controllers.js
// الوصف: سكربت مستقل للتحقق من الـ Controllers
// الاستخدام: node scripts/validate-controllers.js
// ============================================

const { validateAllControllers, exportValidationReport } = require('../src/utils/controllerValidator');

console.log('🔍 Food Delivery API - Controller Validator');
console.log('============================================\n');

// تنفيذ التحقق
const result = validateAllControllers();

// تصدير التقرير
if (process.argv.includes('--export')) {
  exportValidationReport();
}

// الخروج برمز مناسب
process.exit(result.success ? 0 : 1);