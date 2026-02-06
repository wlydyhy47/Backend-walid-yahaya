const winston = require('winston');
const { combine, timestamp, printf, colorize, errors } = winston.format;

// تنسيق الـ logs
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  
  if (stack) {
    log += `\n${stack}`;
  }
  
  if (Object.keys(meta).length > 0) {
    log += `\n${JSON.stringify(meta, null, 2)}`;
  }
  
  return log;
});

// إنشاء الـ logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    // logs للـ console في التطوير
    new winston.transports.Console({
      format: combine(
        colorize(),
        logFormat
      )
    }),
    // logs للأخطاء في ملف
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // logs للمعلومات في ملف
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  // عدم إيقاف التطبيق عند حدوث خطأ في الـ logging
  exitOnError: false
});

// Middleware لـ logging طلبات HTTP
const httpLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id || 'guest'
    };

    if (res.statusCode >= 400) {
      logger.error('HTTP Request Error', logData);
    } else if (res.statusCode >= 300) {
      logger.warn('HTTP Request Warning', logData);
    } else {
      logger.info('HTTP Request', logData);
    }
  });

  next();
};

// Middleware لـ logging الأخطاء
const errorLogger = (error, req, res, next) => {
  logger.error('Unhandled Error', {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id || 'guest'
  });

  next(error);
};

// دالة لـ logging العمليات التجارية
const businessLogger = {
  info: (action, data) => {
    logger.info(`Business Action: ${action}`, data);
  },
  warn: (action, data) => {
    logger.warn(`Business Warning: ${action}`, data);
  },
  error: (action, data) => {
    logger.error(`Business Error: ${action}`, data);
  },
  debug: (action, data) => {
    logger.debug(`Business Debug: ${action}`, data);
  }
};

module.exports = {
  logger,
  httpLogger,
  errorLogger,
  businessLogger
};