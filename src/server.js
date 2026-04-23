// ============================================
// ملف: src/server.js
// ============================================

require("dotenv").config();

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const socketService = require("./services/socket.service");
const apiConfig = require("./config/api.config");
const mapboxConfig = require('./config/mapbox.config');

process.env.NODE_NO_WARNINGS = '1';

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT || 3000;

const API_PREFIX = apiConfig.api.prefix;
const API_VERSION = apiConfig.api.defaultVersion;
const BASE_PATH = `/${API_PREFIX}/${API_VERSION}`;

const printStartupInfo = () => {
  const baseUrl = `http://localhost:${PORT}`;
  const apiUrl = `${baseUrl}/${API_PREFIX}/${API_VERSION}`;
  
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🚀 Drovia Food Delivery API Server                            ║
║   ═══════════════════════════════════════════════════════════   ║
║                                                                  ║
║   ✅ Status: Started Successfully                                ║
║   🌍 Environment: ${(process.env.NODE_ENV?.toUpperCase() || 'DEVELOPMENT').padEnd(30)}║
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

const printServicesInfo = () => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';
  const smsProvider = process.env.SMS_PROVIDER || 'none';
  const redisEnabled = process.env.REDIS_ENABLED === 'true';
  
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║   🔌 Services Status                                             ║
╠══════════════════════════════════════════════════════════════════╣
║   📱 SMS Service:                                                ║
║      - Enabled: ${smsEnabled ? '✅ Yes' : '❌ No'}${' '.repeat(35 - (smsEnabled ? 8 : 5))}║
║      - Provider: ${smsProvider}${' '.repeat(40 - smsProvider.length)}║
║      - Infobip: ${process.env.INFOBIP_API_KEY ? '✅ Configured' : '❌ Missing'}${' '.repeat(28)}║
║                                                                  ║
║   🗺️  Mapbox:                                                   ║
║      - Access Token: ${mapboxConfig.accessToken ? '✅ Configured' : '❌ Missing'}${' '.repeat(28)}║
║      - Style: ${mapboxConfig.style}${' '.repeat(40 - mapboxConfig.style.length)}║
║                                                                  ║
║   💾 Redis:                                                      ║
║      - Enabled: ${redisEnabled ? '✅ Yes' : '❌ No'}${' '.repeat(35 - (redisEnabled ? 8 : 5))}║
║      - URL: ${process.env.REDIS_URL ? '✅ Set' : '❌ Missing'}${' '.repeat(35)}║
║                                                                  ║
║   ☁️  Cloudinary:                                               ║
║      - Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ Missing'}${' '.repeat(35)}║
║                                                                  ║
║   📊 API Config:                                                ║
║      - Prefix: ${apiConfig.api.prefix}${' '.repeat(40 - apiConfig.api.prefix.length)}║
║      - Version: ${apiConfig.api.defaultVersion}${' '.repeat(40 - apiConfig.api.defaultVersion.length)}║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
  `);
};

const checkEnvironmentVariables = () => {
  const requiredVars = [
    'JWT_SECRET',
    'MONGO_URI'
  ];
  
  const optionalVars = [
    'MAPBOX_ACCESS_TOKEN',
    'INFOBIP_API_KEY',
    'CLOUDINARY_CLOUD_NAME'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  const missingOptional = optionalVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn(`
╔══════════════════════════════════════════════════════════════════╗
║   ⚠️  Missing Required Environment Variables                     ║
╠══════════════════════════════════════════════════════════════════╣
${missingVars.map(v => `║   - ${v}${' '.repeat(55 - v.length)}║`).join('\n')}
║                                                                  ║
║   Server cannot start without these variables.                  ║
║   Please check your .env file.                                  ║
╚══════════════════════════════════════════════════════════════════╝
    `);
  }
  
  if (missingOptional.length > 0 && isDevelopment) {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║   ℹ️  Optional Environment Variables Missing                     ║
╠══════════════════════════════════════════════════════════════════╣
${missingOptional.map(v => `║   - ${v}${' '.repeat(55 - v.length)}║`).join('\n')}
║                                                                  ║
║   Some features may be disabled. Continue anyway?               ║
╚══════════════════════════════════════════════════════════════════╝
    `);
  }
  
  return missingVars.length === 0;
};

const setupGracefulShutdown = (server) => {
  const shutdown = (signal) => {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║   👋 ${signal} received. Shutting down gracefully...                 ║
╚══════════════════════════════════════════════════════════════════╝
    `);
    
    server.close(async () => {
      console.log('✅ HTTP server closed');
      
      if (socketService.isInitialized()) {
        socketService.close(() => {
          console.log('✅ Socket.io closed');
        });
      }
      
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      console.log('✅ Database connection closed');
      
      console.log('💤 Graceful shutdown completed');
      process.exit(0);
    });
    
    setTimeout(() => {
      console.error('⚠️ Force closing after timeout');
      process.exit(1);
    }, 10000);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

const setupErrorHandlers = () => {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
    
    if (isProduction) {
      console.error('Please check your code for unhandled promises');
    } else {
      console.warn('⚠️ Unhandled rejection detected. Fix your promises!');
    }
  });
  
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    
    if (isProduction) {
      console.error('Fatal error, shutting down...');
      process.exit(1);
    } else {
      console.warn('⚠️ Uncaught exception detected. Fix your code!');
    }
  });
};

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

const testSmsConnection = async () => {
  const enabled = process.env.SMS_ENABLED === 'true';
  const provider = process.env.SMS_PROVIDER || 'none';
  
  console.log(`   📱 SMS: ${enabled ? `${provider} (Ready)` : 'Disabled'}`);
};


const startServer = async () => {
  try {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🚀 Drovia Food Delivery API Server                            ║
║   ═══════════════════════════════════════════════════════════   ║
║                                                                  ║
║   Initializing services...                                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
    `);
    
    console.log('🔍 Checking environment variables...');
    const envOk = checkEnvironmentVariables();
    if (!envOk && isProduction) {
      throw new Error('Missing required environment variables');
    }
    
    console.log('📊 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected successfully');
    
    console.log('🌐 Creating HTTP server...');
    const server = http.createServer(app);
    
    console.log('💬 Initializing Socket.io...');
    socketService.initialize(server);
    console.log('✅ Socket.io initialized');
    
    await verifyDatabaseConnection();
    await testSmsConnection();
    
    console.log(`🎧 Starting server on port ${PORT}...`);
    server.listen(PORT, () => {
      printStartupInfo();
      printServicesInfo();
    });
    
    setupGracefulShutdown(server);
    
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
    
    setupErrorHandlers();
    
    return server;
    
  } catch (error) {
    console.error(`
╔══════════════════════════════════════════════════════════════════╗
║   ❌ Failed to start server                                       ║
╠══════════════════════════════════════════════════════════════════╣
║   Error: ${error.message}${' '.repeat(55 - Math.min(error.message.length, 55))}║
╚══════════════════════════════════════════════════════════════════╝
    `);
    console.error(error.stack);
    process.exit(1);
  }
}; 

const server = startServer();

module.exports = server;