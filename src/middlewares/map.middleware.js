// ============================================
// ملف: src/middlewares/map.middleware.js
// الوصف: التحقق من صحة بيانات الخرائط
// ============================================

const { AppError } = require('./errorHandler.middleware');

/**
 * التحقق من صحة الإحداثيات
 */
const validateCoordinates = (req, res, next) => {
  const { latitude, longitude } = req.body;

  if (latitude === undefined && longitude === undefined) {
    return next();
  }

  const errors = [];

  if (latitude !== undefined && (isNaN(latitude) || latitude < -90 || latitude > 90)) {
    errors.push('خط العرض غير صالح (يجب أن يكون بين -90 و 90)');
  }

  if (longitude !== undefined && (isNaN(longitude) || longitude < -180 || longitude > 180)) {
    errors.push('خط الطول غير صالح (يجب أن يكون بين -180 و 180)');
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join(' | '), 400));
  }

  next();
};

/**
 * التحقق من صحة المسار
 */
const validateRoute = (req, res, next) => {
  const { origin, destination } = req.body;

  if (!origin || !destination) {
    return next(new AppError('نقطة البداية والوجهة مطلوبتان', 400));
  }

  if (!origin.latitude || !origin.longitude) {
    return next(new AppError('إحداثيات نقطة البداية غير صالحة', 400));
  }

  if (!destination.latitude || !destination.longitude) {
    return next(new AppError('إحداثيات الوجهة غير صالحة', 400));
  }

  next();
};

module.exports = {
  validateCoordinates,
  validateRoute
};