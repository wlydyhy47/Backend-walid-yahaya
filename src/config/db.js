// ============================================
// ملف: src/config/db.js
// ============================================

const mongoose = require("mongoose");
const { businessLogger } = require("../utils/logger.util");

/**
 * خيارات اتصال MongoDB للإصدارات الحديثة
 * بدون الخيارات القديمة useNewUrlParser و useUnifiedTopology
 */
const mongooseOptions = {
  autoIndex: process.env.NODE_ENV !== 'production',
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
  maxPoolSize: 50,
  minPoolSize: 10,
  maxIdleTimeMS: 10000,
  retryWrites: true,
  retryReads: true,
};

/**
 * الاتصال بقاعدة البيانات
 */
const connectDB = async () => {
  try {
    businessLogger.info('🔄 محاولة الاتصال بقاعدة البيانات...');
    
    const conn = await mongoose.connect(process.env.MONGO_URI, mongooseOptions);

    businessLogger.info(`MongoDB Connected ✅`, {
      host: conn.connection.host,
      name: conn.connection.name
    });

    mongoose.connection.on('error', (err) => {
      businessLogger.error('MongoDB connection error:', err);
    });

    return conn;
  } catch (error) {
    businessLogger.error("MongoDB Connection Error ❌", {
      error: error.message,
      stack: error.stack
    });
    
    businessLogger.info('🔄 محاولة إعادة الاتصال بعد 5 ثواني...');
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;