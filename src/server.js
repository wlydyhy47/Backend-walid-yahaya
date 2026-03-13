// ============================================
// ملف: src/server.js (محدث - بدون طباعة مسارات)
// ============================================

require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const socketService = require("./services/socket.service");
const apiConfig = require("./config/api.config");

// إزالة تحذير Deprecation
process.env.NODE_NO_WARNINGS = '1';

const PORT = process.env.PORT || 3000;

console.log(`
╔════════════════════════════════════════╗
║    🚀 Food Delivery API Server        ║
╠════════════════════════════════════════╣
║  Starting with configuration...        ║
╚════════════════════════════════════════╝
`);

// connect database
connectDB(); 

// create http server
const server = http.createServer(app);

// تهيئة Socket.io
socketService.initialize(server);

// start server
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║    ✅ Server Started Successfully      ║
╠════════════════════════════════════════╣
║  📡 Port: ${PORT}
║  📡 API: http://localhost:${PORT}/${apiConfig.api.prefix}/${apiConfig.api.defaultVersion}
║  📚 Docs: http://localhost:${PORT}/api-docs
║  📡 Socket: ${socketService.isInitialized() ? '✅ Ready' : '❌ Not ready'}
║  📦 Version: 1.0.0
╚════════════════════════════════════════╝
  `);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n👋 SIGTERM received. Shutting down gracefully...");
  
  server.close(() => {
    console.log("💤 Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\n👋 SIGINT received. Shutting down gracefully...");
  
  server.close(() => {
    console.log("💤 Server closed");
    process.exit(0);
  });
});