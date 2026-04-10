// scripts/validate-swagger.js
const fs = require('fs');
const path = require('path');

const validateSwaggerDocs = () => {
  console.log('\n🔍 التحقق من صحة توثيق Swagger...\n');
  
  const docsPath = path.join(__dirname, '../src/config/swagger/docs');
  const files = fs.readdirSync(docsPath);
  
  let totalEndpoints = 0;
  let missingDocs = [];
  
  // التحقق من تغطية المسارات
  const routesPath = path.join(__dirname, '../src/routes');
  const routeFiles = fs.readdirSync(routesPath);
  
  routeFiles.forEach(file => {
    if (file.endsWith('.routes.js')) {
      const content = fs.readFileSync(path.join(routesPath, file), 'utf8');
      const routeMatches = content.match(/router\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/g);
      
      if (routeMatches) {
        routeMatches.forEach(route => {
          const [, method, path] = route.match(/router\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/);
          totalEndpoints++;
          
          // التحقق من وجود التوثيق
          let documented = false;
          files.forEach(docFile => {
            const docContent = fs.readFileSync(path.join(docsPath, docFile), 'utf8');
            if (docContent.includes(`"${path}"`) && docContent.includes(`"${method}"`)) {
              documented = true;
            }
          });
          
          if (!documented && !path.includes('*') && !path.includes(':')) {
            missingDocs.push(`${method.toUpperCase()} ${path}`);
          }
        });
      }
    }
  });
  
  console.log(`📊 إجمالي المسارات: ${totalEndpoints}`);
  console.log(`✅ المسارات الموثقة: ${totalEndpoints - missingDocs.length}`);
  console.log(`❌ المسارات غير الموثقة: ${missingDocs.length}`);
  
  if (missingDocs.length > 0) {
    console.log('\n⚠️ المسارات التي تحتاج إلى توثيق:');
    missingDocs.forEach(route => console.log(`   - ${route}`));
  }
  
  console.log('\n✅ تم التحقق من صحة التوثيق\n');
};

validateSwaggerDocs();