// ============================================
// ملف: src/middlewares/errorHandler.middleware.js (محدث)
// الوصف: معالجة الأخطاء المركزية
// ============================================

const { businessLogger } = require("../utils/logger.util");
const mongoose = require('mongoose');

/**
 * فئة الخطأ المخصصة
 */
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code || this.getErrorCode(statusCode, message);

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * الحصول على كود الخطأ بناءً على الحالة والرسالة
   */
  getErrorCode(statusCode, message) {
    const codeMap = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      429: 'RATE_LIMIT_EXCEEDED',
      500: 'INTERNAL_SERVER_ERROR',
      503: 'SERVICE_UNAVAILABLE'
    };

    // البحث عن كود محدد في الرسالة
    if (message.includes('duplicate') || message.includes('unique')) {
      return 'DUPLICATE_KEY';
    }
    
    if (message.includes('validation') || message.includes('Validator')) {
      return 'VALIDATION_ERROR';
    }

    return codeMap[statusCode] || 'UNKNOWN_ERROR';
  }
}

/**
 * معالجة أخطاء التطوير
 */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    message: err.message,
    code: err.code,
    error: err,
    stack: err.stack
  });
};

/**
 * معالجة أخطاء الإنتاج
 */
const sendErrorProd = (err, res) => {
  // خطأ معروف (متوقع)
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
      code: err.code
    });
  } else {
    // خطأ غير معروف
    businessLogger.error('Unexpected error:', err);

    res.status(500).json({
      success: false,
      status: 'error',
      message: 'حدث خطأ غير متوقع',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

/**
 * معالجة أخطاء Mongoose
 */
const handleMongooseError = (err) => {
  // خطأ التكرار (duplicate key)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    const value = err.keyValue[field];
    const message = `القيمة "${value}" موجودة مسبقاً في حقل ${field}`;
    return new AppError(message, 409, 'DUPLICATE_KEY');
  }

  // خطأ التحقق (validation)
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    const message = `خطأ في التحقق: ${errors.join(', ')}`;
    return new AppError(message, 422, 'VALIDATION_ERROR');
  }

  // خطأ Cast (ObjectId غير صالح)
  if (err.name === 'CastError') {
    const message = `قيمة غير صالحة للحقل ${err.path}`;
    return new AppError(message, 400, 'INVALID_ID');
  }

  return err;
};

/**
 * معالجة أخطاء JWT
 */
const handleJWTError = (err) => {
  if (err.name === 'JsonWebTokenError') {
    return new AppError('التوكن غير صالح', 401, 'INVALID_TOKEN');
  }
  
  if (err.name === 'TokenExpiredError') {
    return new AppError('انتهت صلاحية التوكن', 401, 'TOKEN_EXPIRED');
  }

  return err;
};

/**
 * معالجة أخطاء Multer
 */
const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new AppError('حجم الملف كبير جداً', 400, 'FILE_TOO_LARGE');
  }
  
  if (err.code === 'LIMIT_FILE_COUNT') {
    return new AppError('عدد الملفات كبير جداً', 400, 'TOO_MANY_FILES');
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError('نوع الملف غير متوقع', 400, 'UNEXPECTED_FILE');
  }

  return new AppError(`خطأ في رفع الملف: ${err.message}`, 400, 'UPLOAD_ERROR');
};

/**
 * معالجة أخطاء Socket.io
 */
const handleSocketError = (err) => {
  businessLogger.error('Socket error:', err);
  return new AppError('خطأ في الاتصال', 500, 'SOCKET_ERROR');
};

// ========== Middleware الرئيسي لمعالجة الأخطاء ==========

/**
 * @desc    معالج الأخطاء المركزي
 */
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // تسجيل الخطأ
  businessLogger.error('Error caught:', {
    message: err.message,
    statusCode: err.statusCode,
    code: err.code,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id || 'guest',
    stack: err.stack
  });

  // معالجة أنواع مختلفة من الأخطاء
  let error = { ...err };
  error.message = err.message;

  // أخطاء Mongoose
  if (err.name === 'ValidationError' || err.name === 'CastError' || err.code === 11000) {
    error = handleMongooseError(err);
  }

  // أخطاء JWT
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    error = handleJWTError(err);
  }

  // أخطاء Multer
  if (err.name === 'MulterError') {
    error = handleMulterError(err);
  }

  // أخطاء MongoDB
  if (err.name === 'MongoServerError') {
    if (err.code === 11000) {
      error = handleMongooseError(err);
    }
  }

  // أخطاء الشبكة
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    error = new AppError('خطأ في الاتصال بالخادم', 503, 'CONNECTION_ERROR');
  }

  // إرسال الرد المناسب للبيئة
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

/**
 * @desc    معالج المسارات غير الموجودة (404)
 */
const notFoundHandler = (req, res, next) => {
  // السماح للملفات الثابتة بالمرور
  if (req.path.startsWith('/public/') ||
      req.path.startsWith('/images/') ||
      req.path.startsWith('/icons/') ||
      req.path === '/logo.png' ||
      req.path === '/favicon.ico' ||
      req.path.match(/\.(png|jpg|jpeg|gif|ico|svg|css|js|webp|avif|woff|woff2|ttf)$/)) {
    
    return res.status(404).json({
      success: false,
      message: 'الملف غير موجود',
      code: 'FILE_NOT_FOUND',
      path: req.path
    });
  }

  // تسجيل المسارات غير الموجودة
  businessLogger.warn(`Route not found: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  const error = new AppError(
    `لا يمكن العثور على ${req.originalUrl} في هذا الخادم`,
    404,
    'ROUTE_NOT_FOUND'
  );
  
  next(error);
};

/**
 * @desc    معالج الأخطاء غير المتزامنة
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * @desc    معالج الأخطاء للـ Socket.io
 */
const socketErrorHandler = (socket, err) => {
  businessLogger.error('Socket error:', err);
  
  socket.emit('error', {
    message: err.message || 'حدث خطأ في الاتصال',
    code: err.code || 'SOCKET_ERROR'
  });
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  catchAsync,
  socketErrorHandler
};