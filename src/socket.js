const socketService = require("./services/socket.service");

const initSocket = (server) => {
  try {
    const io = socketService.initialize(server);
    
    if (server && server.app) {
      server.app.set('io', io);
      server.app.set('socketService', socketService);
    }
    
    console.log("✅ Socket.io initialized successfully");
    return io;
  } catch (error) {
    console.error("❌ Socket.io initialization failed:", error.message);
    // لا نوقف الخادم إذا فشلت الـ sockets
    return null;
  }
};

module.exports = initSocket;