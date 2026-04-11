// scripts/generate-swagger.js
const autoSwagger = require('../src/utils/autoSwagger');

async function generate() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 Auto Swagger Generator                                 ║
║   ═══════════════════════════════════════════════════════    ║
║                                                              ║
║   يقوم بمسح جميع ملفات المسارات تلقائياً                   ║
║   وإنشاء توثيق Swagger كامل                                 ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);

  try {
    const result = autoSwagger.generateFullSwagger();

    console.log(`
✨ تم الإنشاء بنجاح!
📁 الموقع: src/config/swagger/auto-docs/swagger.auto.json
🔗 رابط التوثيق: http://localhost:3000/api-docs-auto

💡 نصيحة: قم بتشغيل npm run swagger:watch لتحديث تلقائي عند تغيير المسارات
    `);
  } catch (error) {
    console.error('❌ خطأ:', error.message);
    console.error(error.stack);
  }
}

generate();