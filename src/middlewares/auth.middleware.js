const jwt = require("jsonwebtoken");
const cache = require("../utils/cache.util");
const User = require("../models/user.model");

module.exports = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    // التحقق من blacklist
    const isBlacklisted = cache.get(`token:blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ message: "Token is invalid" });
    }

    // التحقق من صلاحية Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // تحديث آخر نشاط للمستخدم
    try {
      const user = await User.findById(decoded.id);
      if (user) {
        user.lastActivity = new Date();
        await user.save();
      }
    } catch (userError) {
      console.error("User activity update error:", userError);
      // لا نوقف الطلب إذا فشل تحديث النشاط
    }

    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    
    res.status(500).json({ message: "Authentication failed" });
  }
};