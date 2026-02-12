// /opt/render/project/src/src/middlewares/errorHandler.middleware.js

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Middleware لمعالجة الأخطاء
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // تسجيل الخطأ
  console.error(`[${new Date().toISOString()}] ERROR:`, {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.user?.id || 'guest'
  });

  // في بيئة التطوير، عرض تفاصيل أكثر
  if (process.env.NODE_ENV === 'development') {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  }

  // في بيئة الإنتاج، عرض رسالة عامة
  const message = err.isOperational ? err.message : 'Something went wrong!';

  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    message
  });
};

// Middleware لالتقاط 404
const notFoundHandler = (req, res, next) => {
  // ✅ تجاهل أخطاء الملفات الثابتة
  if (req.path === '/logo.png' ||
    req.path === '/favicon.ico' ||
    req.path === '/default-avatar.png' ||
    req.path.match(/\.(png|jpg|jpeg|gif|ico|svg|css|js|webp|avif)$/)) {

    return res.status(204).end();
  }

  // ✅ سجل الـ routes المفقودة (مفيد للتصحيح)
  console.warn(`[404] Route not found: ${req.method} ${req.originalUrl} - IP: ${req.ip}`);

  const error = new AppError(`Can't find ${req.originalUrl} on this server!`, 404);
  next(error);
};

// Wrapper لـ async functions
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  catchAsync
};