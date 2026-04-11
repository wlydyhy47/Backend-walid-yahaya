// src/utils/autoSwagger.js
const fs = require('fs');
const pathModule = require('path');  // ✅ تغيير الاسم لتجنب التعارض

class AutoSwaggerGenerator {
  constructor() {
    this.routesDir = pathModule.join(__dirname, '../routes');
    this.outputDir = pathModule.join(__dirname, '../config/swagger/auto-docs');
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * تحليل ملف المسارات واستخراج جميع الـ endpoints
   */
  parseRouteFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const routes = [];
    
    // الأنماط المختلفة للمسارات
    const patterns = [
      // router.get('/path', controller.method)
      /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+\.\w+|\w+)/g,
      // router.route('/path').get(controller.method)
      /router\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\.(get|post|put|delete|patch)\s*\(\s*(\w+\.\w+|\w+)/g,
      // controller.method مباشرة
      /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)/g
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let method, routePath, handler;
        if (match[1] && match[2] && match[3]) {
          // pattern 1: router.method(path, handler)
          method = match[1].toUpperCase();
          routePath = match[2];
          handler = match[3];
        } else if (match[1] && match[2] && match[3]) {
          // pattern 2: router.route(path).method(handler)
          method = match[2].toUpperCase();
          routePath = match[1];
          handler = match[3];
        }
        
        routes.push({
          method,
          path: this.normalizePath(routePath),
          handler,
          file: pathModule.basename(filePath),  // ✅ استخدام pathModule
          auth: this.detectAuth(content, routePath),
          roles: this.detectRoles(content, routePath)
        });
      }
    });
    
    return routes;
  }

  /**
   * توحيد المسار
   */
  normalizePath(routePath) {
    // إزالة المعاملات الاختيارية
    let normalized = routePath.replace(/\?/g, '');
    // تحويل :param إلى {param}
    normalized = normalized.replace(/:(\w+)/g, '{$1}');
    return normalized;
  }

  /**
   * كشف متطلبات المصادقة
   */
  detectAuth(content, routePath) {
    const lines = content.split('\n');
    let hasAuth = false;
    let roles = [];
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(routePath) || lines[i].includes(`'${routePath}'`) || lines[i].includes(`"${routePath}"`)) {
        // ابحث عن auth middleware في الأسطر التالية
        for (let j = i; j < Math.min(i + 10, lines.length); j++) {
          if (lines[j].includes('auth') && !lines[j].includes('//')) {
            hasAuth = true;
          }
          if (lines[j].includes('role(') || lines[j].includes('roleMiddleware')) {
            const roleMatch = lines[j].match(/role\(['"](.+)['"]\)/);
            if (roleMatch && !roles.includes(roleMatch[1])) roles.push(roleMatch[1]);
          }
          if (lines[j].includes('storeOwnerMiddleware') && !roles.includes('vendor')) roles.push('vendor');
          if (lines[j].includes('driverMiddleware') && !roles.includes('driver')) roles.push('driver');
        }
        break;
      }
    }
    
    return { required: hasAuth, roles: roles.length ? roles : null };
  }

  /**
   * كشف الأدوار المطلوبة
   */
  detectRoles(content, routePath) {
    const rolePattern = /role\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    let match;
    const roles = [];
    while ((match = rolePattern.exec(content)) !== null) {
      if (!roles.includes(match[1])) roles.push(match[1]);
    }
    return roles.length ? roles : null;
  }

  /**
   * إنشاء توثيق Swagger تلقائي للمسار
   */
  generateSwaggerPath(route) {
    const methodLower = route.method.toLowerCase();
    const summaryMap = {
      GET: 'استرجاع البيانات',
      POST: 'إنشاء مورد جديد',
      PUT: 'تحديث المورد بالكامل',
      PATCH: 'تحديث جزئي للمورد',
      DELETE: 'حذف المورد'
    };
    
    const pathDoc = {
      [methodLower]: {
        tags: [this.getTagFromPath(route.path)],
        summary: summaryMap[route.method] || 'تنفيذ العملية',
        description: ` endpoint: ${route.path}`,
        parameters: this.extractPathParams(route.path),
        responses: {
          '200': { description: 'تمت العملية بنجاح' },
          '400': { description: 'طلب غير صالح' },
          '401': { description: 'غير مصرح' },
          '403': { description: 'ممنوع الوصول' },
          '404': { description: 'المورد غير موجود' },
          '500': { description: 'خطأ في الخادم' }
        }
      }
    };
    
    if (route.auth.required) {
      pathDoc[methodLower].security = [{ bearerAuth: [] }];
      if (route.auth.roles) {
        pathDoc[methodLower].description += ` (الأدوار: ${route.auth.roles.join(', ')})`;
      }
    }
    
    if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
      pathDoc[methodLower].requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', properties: {} }
          }
        }
      };
    }
    
    return pathDoc;
  }

  /**
   * استخراج معاملات المسار
   */
  extractPathParams(path) {
    const params = [];
    const matches = path.match(/\{(\w+)\}/g);
    if (matches) {
      matches.forEach(param => {
        const name = param.slice(1, -1);
        params.push({
          name,
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: `معرّف ${name}`
        });
      });
    }
    return params;
  }

  /**
   * تحديد الـ Tag المناسب بناءً على المسار
   */
  getTagFromPath(path) {
    if (path.includes('/auth')) return 'Authentication';
    if (path.includes('/users') || path.includes('/profile')) return 'Users';
    if (path.includes('/stores') || path.includes('/store')) return 'Stores';
    if (path.includes('/orders')) return 'Orders';
    if (path.includes('/addresses')) return 'Addresses';
    if (path.includes('/chat')) return 'Chat';
    if (path.includes('/map')) return 'Map';
    if (path.includes('/notifications')) return 'Notifications';
    if (path.includes('/loyalty')) return 'Loyalty';
    if (path.includes('/analytics')) return 'Analytics';
    if (path.includes('/health')) return 'Health';
    if (path.includes('/assets')) return 'Assets';
    if (path.includes('/security')) return 'Security';
    if (path.includes('/aggregate')) return 'Aggregates';
    if (path.includes('/client')) return 'Client';
    if (path.includes('/driver')) return 'Driver';
    if (path.includes('/vendor')) return 'Vendor';
    if (path.includes('/admin')) return 'Admin';
    return 'General';
  }

  /**
   * مسح جميع ملفات المسارات وجمع الـ endpoints
   */
  scanAllRoutes() {
    const files = fs.readdirSync(this.routesDir);
    const allRoutes = [];
    
    files.forEach(file => {
      if (file.endsWith('.routes.js')) {
        const filePath = pathModule.join(this.routesDir, file);
        try {
          const routes = this.parseRouteFile(filePath);
          allRoutes.push(...routes);
          console.log(`   ✅ تم مسح: ${file} (${routes.length} مسار)`);
        } catch (error) {
          console.log(`   ❌ خطأ في: ${file} - ${error.message}`);
        }
      }
    });
    
    return allRoutes;
  }

  /**
   * إنشاء ملف Swagger كامل تلقائياً
   */
  generateFullSwagger() {
    console.log('\n📂 مسح ملفات المسارات...\n');
    
    const routes = this.scanAllRoutes();
    console.log(`\n📊 تم العثور على ${routes.length} مساراً إجمالاً\n`);
    
    // تجميع المسارات
    const paths = {};
    routes.forEach(route => {
      if (!paths[route.path]) {
        paths[route.path] = {};
      }
      Object.assign(paths[route.path], this.generateSwaggerPath(route));
    });
    
    // إنشاء التوثيق الكامل
    const swaggerDoc = {
      openapi: '3.0.0',
      info: {
        title: 'Food Delivery API',
        version: '3.0.0',
        description: 'منصة توصيل طعام متكاملة - تم إنشاؤها تلقائياً',
        contact: {
          name: 'الدعم الفني',
          email: 'support@fooddelivery.com'
        }
      },
      servers: [
        {
          url: 'https://backend-walid-yahaya.onrender.com/api/v1',
          description: 'خادم الإنتاج'
        },
        {
          url: 'http://localhost:3000/api/v1',
          description: 'الخادم المحلي'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      tags: this.generateTags(routes),
      paths
    };
    
    // حفظ الملف
    const outputPath = pathModule.join(this.outputDir, 'swagger.auto.json');
    fs.writeFileSync(outputPath, JSON.stringify(swaggerDoc, null, 2));
    
    console.log(`✅ تم إنشاء التوثيق التلقائي في: ${outputPath}`);
    console.log(`📈 إجمالي المسارات الفريدة الموثقة: ${Object.keys(paths).length}`);
    
    // إنشاء تقرير
    this.generateReport(routes);
    
    return swaggerDoc;
  }

  /**
   * إنشاء الـ Tags من المسارات
   */
  generateTags(routes) {
    const tagsMap = new Map();
    routes.forEach(route => {
      const tag = this.getTagFromPath(route.path);
      if (!tagsMap.has(tag)) {
        tagsMap.set(tag, { name: tag, description: this.getTagDescription(tag) });
      }
    });
    return Array.from(tagsMap.values());
  }

  getTagDescription(tag) {
    const descriptions = {
      'Authentication': '🔐 المصادقة وإدارة الحسابات',
      'Users': '👥 إدارة المستخدمين',
      'Stores': '🏪 المتاجر والمنتجات',
      'Orders': '📦 إدارة الطلبات',
      'Addresses': '📍 إدارة العناوين',
      'Chat': '💬 الدردشة والمراسلة',
      'Map': '🗺️ الخرائط والتتبع',
      'Notifications': '🔔 الإشعارات',
      'Loyalty': '🎁 الولاء والنقاط',
      'Analytics': '📊 التحليلات',
      'Health': '🏥 فحص صحة النظام',
      'Assets': '📁 الملفات الثابتة',
      'Security': '🔒 الأمان',
      'Aggregates': '📊 البيانات المجمعة',
      'Client': '👤 مسارات العميل',
      'Driver': '🚗 مسارات المندوب',
      'Vendor': '🏪 مسارات التاجر',
      'Admin': '👑 مسارات المشرف',
      'General': '📌 مسارات عامة'
    };
    return descriptions[tag] || 'مسارات متنوعة';
  }

  /**
   * إنشاء تقرير بالمسارات
   */
  generateReport(routes) {
    const grouped = {};
    routes.forEach(route => {
      const tag = this.getTagFromPath(route.path);
      if (!grouped[tag]) grouped[tag] = [];
      grouped[tag].push(route);
    });
    
    console.log('\n📊 تقرير المسارات حسب المجموعة:\n');
    console.log('┌' + '─'.repeat(50) + '┐');
    for (const [tag, tagRoutes] of Object.entries(grouped).sort()) {
      const secured = tagRoutes.filter(r => r.auth.required).length;
      console.log(`│ ${tag.padEnd(20)} │ ${String(tagRoutes.length).padStart(4)} مسار │ 🔒 ${secured} │`);
    }
    console.log('└' + '─'.repeat(50) + '┘');
    
    const totalEndpoints = routes.length;
    const securedEndpoints = routes.filter(r => r.auth.required).length;
    const publicEndpoints = totalEndpoints - securedEndpoints;
    
    console.log('\n📈 ملخص نهائي:');
    console.log(`   ┌─────────────────────────────────────────┐`);
    console.log(`   │ إجمالي المسارات: ${String(totalEndpoints).padStart(32)} │`);
    console.log(`   │ مسارات محمية: ${String(securedEndpoints).padStart(34)} │`);
    console.log(`   │ مسارات عامة: ${String(publicEndpoints).padStart(35)} │`);
    console.log(`   │ نسبة التغطية: ${String(Math.round(securedEndpoints/totalEndpoints*100) + '%').padStart(34)} │`);
    console.log(`   └─────────────────────────────────────────┘`);
  }
}

module.exports = new AutoSwaggerGenerator();