// ============================================
// ملف: src/server.js
// الوصف: نقطة دخول الخادم - مُنظم مع أفضل الممارسات
// الإصدار: 3.0.0
// التاريخ: 2026-03-25
// ============================================

require("dotenv").config();

// ========== 1. الاستيرادات ==========
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const socketService = require("./services/socket.service");
const apiConfig = require("./config/api.config");
const mapboxConfig = require('./config/mapbox.config');

// إزالة تحذيرات Deprecation
process.env.NODE_NO_WARNINGS = '1';

// تحديد البيئة
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT || 3000;

// ========== 2. دوال مساعدة ==========

/**
 * طباعة معلومات بدء التشغيل بشكل منظم
 */
const printStartupInfo = () => {
  const baseUrl = `http://localhost:${PORT}`;
  const apiUrl = `${baseUrl}/${apiConfig.api.prefix}/${apiConfig.api.defaultVersion}`;
  
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🚀 Food Delivery API Server                                    ║
║   ═══════════════════════════════════════════════════════════   ║
║                                                                  ║
║   ✅ Status: Started Successfully                                ║
║   🌍 Environment: ${process.env.NODE_ENV?.toUpperCase() || 'DEVELOPMENT'}${' '.repeat(30 - (process.env.NODE_ENV?.length || 12))}║
║   📡 Port: ${PORT}${' '.repeat(40 - String(PORT).length)}║
║   🔗 API Base: ${apiUrl}${' '.repeat(40 - apiUrl.length)}║
║   📚 Docs: ${baseUrl}/api-docs${' '.repeat(40 - (baseUrl + '/api-docs').length)}║
║   🏥 Health: ${baseUrl}/health${' '.repeat(40 - (baseUrl + '/health').length)}║
║   💬 Socket: ${socketService.isInitialized() ? '✅ Ready' : '❌ Not ready'}${' '.repeat(32)}║
║   📦 Version: 3.0.0${' '.repeat(34)}║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
  `);
};

/**
 * طباعة معلومات الخدمات المتصلة
 */
const printServicesInfo = () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║   🔌 Services Status                                             ║
╠══════════════════════════════════════════════════════════════════╣
║   🗺️  Mapbox:                                                   ║
║      - Access Token: ${mapboxConfig.accessToken ? '✅ Configured' : '❌ Missing'}${' '.repeat(35 - (mapboxConfig.accessToken ? 16 : 12))}║
║      - Secret Token: ${mapboxConfig.secretToken ? '✅ Configured' : '❌ Missing'}${' '.repeat(35 - (mapboxConfig.secretToken ? 16 : 12))}║
║      - Style: ${mapboxConfig.style}${' '.repeat(40 - mapboxConfig.style.length)}║
║      - Default Zoom: ${mapboxConfig.defaultZoom}${' '.repeat(38 - String(mapboxConfig.defaultZoom).length)}║
║                                                                  ║
║   📊 API Config:                                                ║
║      - Prefix: ${apiConfig.api.prefix}${' '.repeat(40 - apiConfig.api.prefix.length)}║
║      - Version: ${apiConfig.api.defaultVersion}${' '.repeat(40 - apiConfig.api.defaultVersion.length)}║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
  `);
};

/**
 * التحقق من المتغيرات البيئية الأساسية
 */
const checkEnvironmentVariables = () => {
  const requiredVars = [
    'JWT_SECRET',
    'MONGO_URI',
    'MAPBOX_ACCESS_TOKEN'
  ]; 
   
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn(`
╔══════════════════════════════════════════════════════════════════╗
║   ⚠️  Missing Environment Variables                               ║
╠══════════════════════════════════════════════════════════════════╣
║   The following variables are not set:                           ║
${missingVars.map(v => `║   - ${v}${' '.repeat(55 - v.length)}║`).join('\n')}
║                                                                  ║
║   Some features may not work correctly.                         ║
║   Please check your .env file.                                  ║
╚══════════════════════════════════════════════════════════════════╝
    `);
  }
  
  return missingVars.length === 0;
};

/**
 * إعداد معالجة الإغلاق الآمن
 */
const setupGracefulShutdown = (server) => {
  const shutdown = (signal) => {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║   👋 ${signal} received. Shutting down gracefully...                 ║
╚══════════════════════════════════════════════════════════════════╝
    `);
    
    // إغلاق الخادم
    server.close(() => {
      console.log('✅ HTTP server closed');
      
      // إغلاق اتصال Socket.io
      if (socketService.isInitialized()) {
        socketService.close(() => {
          console.log('✅ Socket.io closed');
        });
      }
      
      console.log('💤 Graceful shutdown completed');
      process.exit(0);
    });
    
    // إجبار الإغلاق بعد 10 ثواني
    setTimeout(() => {
      console.error('⚠️ Force closing after timeout');
      process.exit(1);
    }, 10000);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

/**
 * معالجة الأخطاء غير المتوقعة
 */
const setupErrorHandlers = () => {
  // Unhandled Promise Rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
    
    if (isProduction) {
      // في الإنتاج، نرسل إلى خدمة مراقبة مثل Sentry
      // Sentry.captureException(reason);
      console.error('Please check your code for unhandled promises');
    } else {
      // في التطوير، نستمر ولكن نسجل الخطأ
      console.warn('⚠️ Unhandled rejection detected. Fix your promises!');
    }
  });
  
  // Uncaught Exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    
    if (isProduction) {
      // في الإنتاج، نسجل ونخرج بشكل آمن
      console.error('Fatal error, shutting down...');
      process.exit(1);
    } else {
      // في التطوير، نستمر ولكن نسجل الخطأ
      console.warn('⚠️ Uncaught exception detected. Fix your code!');
    }
  });
};

/**
 * التحقق من اتصال قاعدة البيانات
 */
const verifyDatabaseConnection = async () => {
  try {
    const mongoose = require('mongoose');
    const state = mongoose.connection.readyState;
    
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    console.log(`   📊 Database: ${states[state] || 'unknown'}`);
    return state === 1;
  } catch (error) {
    console.error('   ❌ Database connection check failed:', error.message);
    return false;
  }
};

// ========== 3. تشغيل الخادم ==========

/**
 * تشغيل الخادم الرئيسي
 */
const startServer = async () => {
  try {
    // طباعة معلومات بدء التشغيل
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🚀 Food Delivery API Server                                    ║
║   ═══════════════════════════════════════════════════════════   ║
║                                                                  ║
║   Initializing services...                                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
    `);
    
    // 1. التحقق من المتغيرات البيئية
    console.log('🔍 Checking environment variables...');
    const envOk = checkEnvironmentVariables();
    if (!envOk && isProduction) {
      throw new Error('Missing required environment variables');
    }
    
    // 2. الاتصال بقاعدة البيانات
    console.log('📊 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected successfully');
    
    // 3. إنشاء خادم HTTP
    console.log('🌐 Creating HTTP server...');
    const server = http.createServer(app);
    
    // 4. تهيئة Socket.io
    console.log('💬 Initializing Socket.io...');
    socketService.initialize(server);
    console.log('✅ Socket.io initialized');
    
    // 5. التحقق من اتصال قاعدة البيانات بعد التهيئة
    await verifyDatabaseConnection();
    
    // 6. بدء الاستماع
    console.log(`🎧 Starting server on port ${PORT}...`);
    server.listen(PORT, () => {
      printStartupInfo();
      printServicesInfo();
    });
    
    // 7. إعداد معالجة الإغلاق الآمن
    setupGracefulShutdown(server);
    
    // 8. إضافة مستمع لأحداث الخادم
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`
╔══════════════════════════════════════════════════════════════════╗
║   ❌ Port ${PORT} is already in use                                     ║
║                                                                  ║
║   Please close the other application using port ${PORT}           ║
║   or change the PORT in your .env file.                         ║
╚══════════════════════════════════════════════════════════════════╝
        `);
        process.exit(1);
      } else {
        console.error('❌ Server error:', error);
      }
    });
    
    // 9. إعداد معالجة الأخطاء
    setupErrorHandlers();
    
    return server;
    
  } catch (error) {
    console.error(`
╔══════════════════════════════════════════════════════════════════╗
║   ❌ Failed to start server                                       ║
╠══════════════════════════════════════════════════════════════════╣
║   Error: ${error.message}${' '.repeat(55 - error.message.length)}║
╚══════════════════════════════════════════════════════════════════╝
    `);
    console.error(error.stack);
    process.exit(1);
  }
};

// ========== 4. تشغيل التطبيق ==========

// بدء الخادم
const server = startServer();

// تصدير الخادم للاختبارات
module.exports = server;