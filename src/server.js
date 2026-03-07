require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const socketService = require("./services/socket.service");
const redisClient = require('./config/redis-client');
const PORT = process.env.PORT || 3000;

// connect database
connectDB(); 

// محاولة الاتصال بـ Redis (بدون إيقاف التطبيق إذا فشل)
redisClient.connect().catch(() => {
  console.log('⚠️ Continuing without Redis...');
});

// create http server
const server = http.createServer(app);

// تهيئة Socket.io باستخدام socketService
socketService.initialize(server);

// تحقق من وجود notificationCleanupJob قبل استدعائه
let notificationCleanupJob;
try {
  notificationCleanupJob = require("./jobs/notificationCleanup.job");
  if (notificationCleanupJob && notificationCleanupJob.start) {
    notificationCleanupJob.start();
  }
} catch (error) {
  console.log("⚠️ Notification cleanup job not found or has errors:", error.message);
}

// start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io service: ${socketService.isInitialized() ? '✅ Ready' : '❌ Not ready'}`);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("👋 SIGTERM received. Shutting down gracefully...");
  
  if (notificationCleanupJob && notificationCleanupJob.stop) {
    notificationCleanupJob.stop();
  }
  
  server.close(() => {
    console.log("💤 Server closed");
    process.exit(0);
  });
});