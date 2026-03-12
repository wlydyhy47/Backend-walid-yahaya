// ============================================
// ملف: src/utils/routeDebugger.util.js
// الوصف: أداة لتصحيح أخطاء المسارات
// ============================================

const printAllRoutes = (app) => {
  console.log('\n🔍 ===== جميع المسارات المسجلة في Express =====');
  
  if (!app._router || !app._router.stack) {
    console.log('⚠️ لم يتم تهيئة الـ Router بعد');
    return;
  }

  app._router.stack.forEach((layer) => {
    if (layer.route) {
      // مسارات مباشرة
      const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
      console.log(`${methods.padEnd(6)} ${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle.stack) {
      // Router groups
      const routerPath = layer.regexp.source
        .replace(/\\\//g, '/')
        .replace(/\^/g, '')
        .replace(/\?/g, '')
        .replace(/\(\?:\(\?\\[^)]+\)\)/g, '');
      
      console.log(`\n📁 Router: ${routerPath}`);
      
      layer.handle.stack.forEach((subLayer) => {
        if (subLayer.route) {
          const methods = Object.keys(subLayer.route.methods).join(', ').toUpperCase();
          console.log(`  ${methods.padEnd(6)} ${subLayer.route.path}`);
        }
      });
    }
  });
  
  console.log('🔍 ===== نهاية المسارات =====\n');
};

// للتصحيح المتقدم - عرض هيكل الـ Router بالكامل
const debugRouterStructure = (app) => {
  console.log('\n🔧 ===== هيكل الـ Router بالكامل =====');
  
  if (!app._router || !app._router.stack) {
    console.log('⚠️ لم يتم تهيئة الـ Router بعد');
    return;
  }

  app._router.stack.forEach((layer, index) => {
    console.log(`\n[${index}] Layer:`);
    console.log(`  - الاسم: ${layer.name || 'unnamed'}`);
    console.log(`  - المسار: ${layer.regexp}`);
    
    if (layer.route) {
      console.log(`  - النوع: Route مباشر`);
      console.log(`  - الطرق: ${Object.keys(layer.route.methods).join(', ')}`);
    } else if (layer.name === 'router') {
      console.log(`  - النوع: Router`);
      console.log(`  - عدد المسارات الفرعية: ${layer.handle.stack.length}`);
    }
  });
  
  console.log('🔧 ===== نهاية الهيكل =====\n');
};

module.exports = {
  printAllRoutes,
  debugRouterStructure
};