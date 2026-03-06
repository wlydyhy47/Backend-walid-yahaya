// src/middlewares/validate.middleware.js
const { AppError } = require('./errorHandler.middleware');

/**
 * Middleware للتحقق من صحة البيانات
 * @param {Joi.Schema} schema - مخطط Joi للتحقق
 * @param {string} property - أي جزء من الطلب نتحقق منه (body, query, params)
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // جمع كل الأخطاء بدلاً من التوقف عند أول خطأ
      stripUnknown: true, // إزالة الحقول غير المعروفة
      allowUnknown: false // عدم السماح بحقول غير معروفة
    });

    if (error) {
      // تنسيق الأخطاء بشكل مقروء
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return next(new AppError(
        errors.map(e => e.message).join(' | '), 
        400
      ));
    }

    // استبدال البيانات بالنسخة المنقحة (بدون الحقول غير المسموحة)
    req[property] = value;
    next();
  };
};

module.exports = validate;