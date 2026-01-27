require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const initSocket = require("./socket"); // سننشئه

const PORT = process.env.PORT || 3000;

// connect database
connectDB();

// create http server
const server = http.createServer(app);

// init socket.io
initSocket(server);

// start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
