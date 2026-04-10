// src/config/swagger/swagger.config.js
const path = require('path');
const fs = require('fs');

// تحميل جميع ملفات التوثيق
const loadSwaggerDocs = () => {
  const docsPath = path.join(__dirname, './docs');
  const swaggerDocs = {
    openapi: '3.0.0',
    info: {
      title: 'Food Delivery API',
      version: '3.0.0',
      description: 'منصة توصيل طعام متكاملة',
      contact: {
        name: 'الدعم الفني',
        email: 'support@fooddelivery.com',
        url: 'https://fooddelivery.com/support'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
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
    paths: {},
    tags: []
  };

  // تحميل ملفات التوثيق
  if (fs.existsSync(docsPath)) {
    const files = fs.readdirSync(docsPath);
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const doc = require(path.join(docsPath, file));
        Object.assign(swaggerDocs.paths, doc.paths || {});
        if (doc.tags) swaggerDocs.tags.push(...doc.tags);
        if (doc.components) {
          swaggerDocs.components = {
            ...swaggerDocs.components,
            ...doc.components
          };
        }
      }
    });
  }

  return swaggerDocs;
};

module.exports = loadSwaggerDocs();