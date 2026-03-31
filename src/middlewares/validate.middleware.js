const Joi = require('joi');
const mongoose = require('mongoose');
const { AppError } = require('./errorHandler.middleware');
const { businessLogger } = require("../utils/logger.util");

/**
 * تحويل القيم من FormData إلى الأنواع الصحيحة
 */
const transformFormData = (data) => {
  const transformed = { ...data };

  // تحويل القيم الرقمية
  const numberFields = ['price', 'discountedPrice', 'preparationTime', 'spicyLevel', 'calories',
    'deliveryFee', 'minOrderAmount', 'estimatedDeliveryTime', 'deliveryRadius',
    'freeDeliveryThreshold', 'latitude', 'longitude'];
  numberFields.forEach(field => {
    if (transformed[field] !== undefined && transformed[field] !== '' && transformed[field] !== null) {
      const num = Number(transformed[field]);
      if (!isNaN(num)) {
        transformed[field] = num;
      }
    }
  });

  // تحويل القيم المنطقية
  const booleanFields = ['isAvailable', 'isVegetarian', 'isVegan', 'isGlutenFree',
    'hasDelivery', 'isOpen', 'isVerified'];
  booleanFields.forEach(field => {
    if (transformed[field] !== undefined && transformed[field] !== '') {
      transformed[field] = transformed[field] === 'true' || transformed[field] === true;
    }
  });

  // تحويل JSON strings - مع التعامل مع القيم الفارغة
  const jsonFields = ['address', 'deliveryInfo', 'openingHours'];
  jsonFields.forEach(field => {
    if (transformed[field] !== undefined && transformed[field] !== '' && transformed[field] !== null) {
      if (typeof transformed[field] === 'string') {
        try {
          const parsed = JSON.parse(transformed[field]);
          transformed[field] = parsed;
        } catch (e) {
          // إذا فشل الـ parse، نحذف الحقل أو نتركه
          console.warn(`Failed to parse ${field}:`, e.message);
          delete transformed[field];
        }
      }
    } else {
      // إذا كان الحقل فارغاً، نحذفه
      delete transformed[field];
    }
  });

  // تحويل التاغات
  if (transformed.tags !== undefined && transformed.tags !== '' && transformed.tags !== null) {
    if (Array.isArray(transformed.tags)) {
      // إذا كانت already array، لا تفعل شيئاً
      transformed.tags = transformed.tags;
    } else if (typeof transformed.tags === 'string') {
      if (transformed.tags.includes(',')) {
        transformed.tags = transformed.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      } else if (transformed.tags.trim()) {
        transformed.tags = [transformed.tags.trim()];
      } else {
        transformed.tags = [];
      }
    }
  } else {
    transformed.tags = [];
  }

  return transformed;
};


// ✅ الدالة الرئيسية validate (المعدلة)
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    if (!schema) {
      return next();
    }

    let data = req[property];

    // ✅ التحسين: السماح بوجود بيانات في FormData حتى لو req.body فارغ
    const isMultipart = req.headers['content-type']?.includes('multipart/form-data');

    if (!data && property === 'body') {
      // إذا كان الطلب من نوع multipart/form-data ولا توجد بيانات في body
      if (isMultipart) {
        // إنشاء كائن فارغ للبيانات (قد تكون في req.files فقط)
        data = {};
        req[property] = data;
      } else {
        return next(new AppError('لا توجد بيانات للإرسال', 400));
      }
    }

    // تحويل البيانات إذا كانت من FormData
    if (property === 'body' && isMultipart) {
      data = transformFormData(data);
      req[property] = data; // تحديث req.body بالبيانات المحولة
    }

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: true, // السماح بحقول إضافية
      errors: {
        wrap: {
          label: false
        }
      }
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      businessLogger.warn('Validation failed', { errors, property, path: req.path });

      return next(new AppError(
        errors.map(e => e.message).join(' | '),
        400
      ));
    }

    req[property] = value;
    next();
  };
};

// دوال مساعدة
const validateQuery = (schema) => validate(schema, 'query');
const validateParams = (schema) => validate(schema, 'params');
const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName] || req.body[paramName] || req.query[paramName];

    if (!id) {
      return next(new AppError(`معرِّف ${paramName} مطلوب`, 400));
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError(`معرِّف ${paramName} غير صالح`, 400));
    }

    next();
  };
};

const validatePagination = (req, res, next) => {
  const { page, limit, sortBy, sortOrder } = req.query;

  const errors = [];

  if (page && (isNaN(page) || parseInt(page) < 1)) {
    errors.push('رقم الصفحة يجب أن يكون رقماً موجباً');
  }

  if (limit && (isNaN(limit) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
    errors.push('الحد يجب أن يكون بين 1 و 100');
  }

  if (sortOrder && !['asc', 'desc', 'ASC', 'DESC'].includes(sortOrder)) {
    errors.push('اتجاه الترتيب غير صالح (asc أو desc)');
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join(' | '), 400));
  }

  next();
};

const sanitizeInput = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<[^>]*>/g, '')
          .replace(/javascript:/gi, '')
          .replace(/onerror=/gi, '')
          .replace(/onload=/gi, '')
          .trim();
      }
    });
  }

  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<[^>]*>/g, '')
          .trim();
      }
    });
  }

  next();
};

const validateFileUpload = (req, res, next) => {
  // ✅ التحسين: السماح بوجود ملفات فقط بدون بيانات نصية
  const hasFiles = req.file || req.files;
  const hasBodyData = req.body && Object.keys(req.body).length > 0;

  if (!hasFiles && !hasBodyData) {
    return next(new AppError('لم يتم رفع أي ملف أو إرسال بيانات', 400));
  }

  const maxSize = 5 * 1024 * 1024; // 5MB

  if (req.file && req.file.size > maxSize) {
    return next(new AppError('حجم الملف يجب أن لا يتجاوز 5MB', 400));
  }

  if (req.files) {
    const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
    for (const file of files) {
      if (file.size > maxSize) {
        return next(new AppError('حجم الملف يجب أن لا يتجاوز 5MB', 400));
      }
    }
  }

  next();
};

const validateDriverLocation = (req, res, next) => {
  const { latitude, longitude } = req.body;

  const errors = [];

  if (!latitude || isNaN(latitude) || latitude < -90 || latitude > 90) {
    errors.push('خط العرض غير صالح (يجب أن يكون بين -90 و 90)');
  }

  if (!longitude || isNaN(longitude) || longitude < -180 || longitude > 180) {
    errors.push('خط الطول غير صالح (يجب أن يكون بين -180 و 180)');
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join(' | '), 400));
  }

  next();
};

const validatePassword = (password, isRequired = true) => {
  const errors = [];

  if (isRequired && !password) {
    errors.push('كلمة المرور مطلوبة');
  } else if (password) {
    if (password.length < 6) {
      errors.push('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    }
    if (password.length > 100) {
      errors.push('كلمة المرور يجب أن لا تتجاوز 100 حرف');
    }
  }

  return errors;
};

const validatePhone = (phone, isRequired = true) => {
  const errors = [];

  if (isRequired && !phone) {
    errors.push('رقم الهاتف مطلوب');
  } else if (phone) {
    const phoneRegex = /^[\+]?[0-9]{1,4}?[-\s]?[(]?[0-9]{1,4}[)]?[-\s]?[0-9]{1,4}[-\s]?[0-9]{1,9}$/;
    if (!phoneRegex.test(phone)) {
      errors.push('رقم الهاتف غير صالح');
    }
  }

  return errors;
};

const validateEmail = (email, isRequired = false) => {
  const errors = [];

  if (isRequired && !email) {
    errors.push('البريد الإلكتروني مطلوب');
  } else if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('البريد الإلكتروني غير صالح');
    }
  }

  return errors;
};

// ✅ تصدير الدالة الرئيسية وكل الدوال المساعدة
module.exports = validate;
module.exports.validateQuery = validateQuery;
module.exports.validateParams = validateParams;
module.exports.validateObjectId = validateObjectId;
module.exports.validatePagination = validatePagination;
module.exports.sanitizeInput = sanitizeInput;
module.exports.validateFileUpload = validateFileUpload;
module.exports.validateDriverLocation = validateDriverLocation;
module.exports.validatePassword = validatePassword;
module.exports.validatePhone = validatePhone;
module.exports.validateEmail = validateEmail;