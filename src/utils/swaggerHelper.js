// ============================================
// ملف: src/utils/swaggerHelper.js
// الوصف: دوال مساعدة لتوثيق Swagger
// ============================================

const fs = require('fs');
const path = require('path');

/**
 * تحميل جميع الـ Validators من المجلد
 */
const loadValidators = () => {
  const validatorsPath = path.join(__dirname, '../validators');
  const validators = {};
  
  if (fs.existsSync(validatorsPath)) {
    const files = fs.readdirSync(validatorsPath);
    for (const file of files) {
      if (file.endsWith('.validator.js')) {
        const name = file.replace('.validator.js', '');
        try {
          validators[name] = require(path.join(validatorsPath, file));
        } catch (error) {
          console.warn(`⚠️ Could not load validator: ${file}`);
        }
      }
    }
  }
  
  return validators;
};

/**
 * إنشاء وصف تلقائي للمسار
 */
const generateRouteDescription = (route) => {
  const descriptions = {
    GET: 'استرجاع البيانات',
    POST: 'إنشاء مورد جديد',
    PUT: 'تحديث المورد بالكامل',
    PATCH: 'تحديث جزئي للمورد',
    DELETE: 'حذف المورد'
  };
  
  return descriptions[route.method] || 'تنفيذ العملية';
};

/**
 * إضافة أمثلة تلقائية للمعلمات
 */
const generateExamples = (schema) => {
  const examples = {};
  
  for (const [key, value] of Object.entries(schema.properties || {})) {
    if (value.type === 'string') {
      if (value.format === 'email') {
        examples[key] = 'user@example.com';
      } else if (key.includes('password')) {
        examples[key] = 'Pass@123';
      } else if (key.includes('phone')) {
        examples[key] = '+966501234567';
      } else {
        examples[key] = `example_${key}`;
      }
    } else if (value.type === 'number') {
      examples[key] = 0;
    } else if (value.type === 'boolean') {
      examples[key] = true;
    } else if (value.type === 'array') {
      examples[key] = [];
    }
  }
  
  return examples;
};

module.exports = {
  loadValidators,
  generateRouteDescription,
  generateExamples
};