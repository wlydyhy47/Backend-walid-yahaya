const { AppError } = require('./errorHandler.middleware');
const mongoose = require('mongoose');

class ValidationMiddleware {
  validateRegister(req, res, next) {
    const { name, phone, password, email, role } = req.body;
    
    const errors = [];
    
    // التحقق من الاسم
    if (!name || name.trim().length < 2) {
      errors.push('الاسم يجب أن يكون على الأقل حرفين');
    }
    
    if (name && name.trim().length > 100) {
      errors.push('الاسم يجب ألا يتجاوز 100 حرف');
    }
    
    // التحقق من الهاتف
    if (!phone) {
      errors.push('رقم الهاتف مطلوب');
    } else {
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        errors.push('رقم الهاتف غير صالح');
      }
    }
    
    // التحقق من كلمة المرور
    if (!password) {
      errors.push('كلمة المرور مطلوبة');
    } else if (password.length < 6) {
      errors.push('كلمة المرور يجب أن تكون على الأقل 6 أحرف');
    } else if (password.length > 100) {
      errors.push('كلمة المرور يجب ألا تتجاوز 100 حرف');
    }
    
    // التحقق من البريد الإلكتروني
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push('البريد الإلكتروني غير صالح');
      }
    }
    
    // التحقق من الدور
    if (role && !['client', 'driver', 'admin'].includes(role)) {
      errors.push('الدور غير صالح');
    }
    
    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }
    
    next();
  }

  validateLogin(req, res, next) {
    const { phone, password } = req.body;
    
    const errors = [];
    
    if (!phone) {
      errors.push('رقم الهاتف مطلوب');
    }
    
    if (!password) {
      errors.push('كلمة المرور مطلوبة');
    }
    
    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }
    
    next();
  }

  validateOrder(req, res, next) {
    const { items, totalPrice, pickupAddress, deliveryAddress, restaurant } = req.body;
    
    const errors = [];
    
    // التحقق من العناصر
    if (!items || !Array.isArray(items) || items.length === 0) {
      errors.push('يجب إضافة عناصر للطلب');
    } else {
      items.forEach((item, index) => {
        if (!item.name || !item.qty || !item.price) {
          errors.push(`العنصر ${index + 1} ناقص المعلومات`);
        }
        
        if (item.qty <= 0) {
          errors.push(`الكمية للعنصر ${index + 1} يجب أن تكون أكبر من الصفر`);
        }
        
        if (item.price < 0) {
          errors.push(`سعر العنصر ${index + 1} غير صالح`);
        }
      });
    }
    
    // التحقق من السعر الإجمالي
    if (!totalPrice || totalPrice <= 0) {
      errors.push('السعر الإجمالي غير صالح');
    }
    
    // التحقق من العناوين
    if (!pickupAddress || !mongoose.Types.ObjectId.isValid(pickupAddress)) {
      errors.push('عنوان الاستلام غير صالح');
    }
    
    if (!deliveryAddress || !mongoose.Types.ObjectId.isValid(deliveryAddress)) {
      errors.push('عنوان التوصيل غير صالح');
    }
    
    // التحقق من المطعم
    if (!restaurant || !mongoose.Types.ObjectId.isValid(restaurant)) {
      errors.push('المطعم غير صالح');
    }
    
    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }
    
    next();
  }

  validateRestaurant(req, res, next) {
    const { name, type, phone, email } = req.body;
    
    const errors = [];
    
    // التحقق من الاسم
    if (!name || name.trim().length < 2) {
      errors.push('اسم المطعم يجب أن يكون على الأقل حرفين');
    }
    
    if (name && name.trim().length > 100) {
      errors.push('اسم المطعم يجب ألا يتجاوز 100 حرف');
    }
    
    // التحقق من النوع
    if (type && !['restaurant', 'cafe', 'bakery', 'fast-food', 'grocery', 'pharmacy', 'other'].includes(type)) {
      errors.push('نوع المطعم غير صالح');
    }
    
    // التحقق من الهاتف
    if (phone) {
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        errors.push('رقم هاتف المطعم غير صالح');
      }
    }
    
    // التحقق من البريد الإلكتروني
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push('بريد المطعم الإلكتروني غير صالح');
      }
    }
    
    // التحقق من رسوم التوصيل
    if (req.body.deliveryFee && req.body.deliveryFee < 0) {
      errors.push('رسوم التوصيل يجب أن تكون أكبر من أو تساوي الصفر');
    }
    
    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }
    
    next();
  }

  validateItem(req, res, next) {
    const { name, price, restaurant, category } = req.body;
    
    const errors = [];
    
    // التحقق من الاسم
    if (!name || name.trim().length < 2) {
      errors.push('اسم العنصر يجب أن يكون على الأقل حرفين');
    }
    
    // التحقق من السعر
    if (!price || price <= 0) {
      errors.push('سعر العنصر غير صالح');
    }
    
    // التحقق من المطعم
    if (!restaurant || !mongoose.Types.ObjectId.isValid(restaurant)) {
      errors.push('المطعم غير صالح');
    }
    
    // التحقق من الفئة
    if (category && !['appetizer', 'main', 'dessert', 'drink', 'side', 'special'].includes(category)) {
      errors.push('فئة العنصر غير صالحة');
    }
    
    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }
    
    next();
  }

  validateAddress(req, res, next) {
    const { addressLine, label, latitude, longitude } = req.body;
    
    const errors = [];
    
    // التحقق من العنوان
    if (!addressLine || addressLine.trim().length < 5) {
      errors.push('العنوان يجب أن يكون على الأقل 5 أحرف');
    }
    
    // التحقق من التسمية
    if (!label || !['Home', 'Work', 'Office', 'Other'].includes(label)) {
      errors.push('تسمية العنوان غير صالحة');
    }
    
    // التحقق من الإحداثيات (اختياري)
    if (latitude && (latitude < -90 || latitude > 90)) {
      errors.push('خط العرض غير صالح');
    }
    
    if (longitude && (longitude < -180 || longitude > 180)) {
      errors.push('خط الطول غير صالح');
    }
    
    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }
    
    next();
  }

  validateReview(req, res, next) {
    const { rating, comment, restaurant } = req.body;
    
    const errors = [];
    
    // التحقق من التقييم
    if (!rating || rating < 1 || rating > 5) {
      errors.push('التقييم يجب أن يكون بين 1 و 5');
    }
    
    // التحقق من التعليق
    if (comment && comment.length > 1000) {
      errors.push('التعليق يجب ألا يتجاوز 1000 حرف');
    }
    
    // التحقق من المطعم
    if (!restaurant || !mongoose.Types.ObjectId.isValid(restaurant)) {
      errors.push('المطعم غير صالح');
    }
    
    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }
    
    next();
  }

  validateNotification(req, res, next) {
    const { title, content, type, priority } = req.body;
    
    const errors = [];
    
    // التحقق من العنوان
    if (!title || title.trim().length < 2) {
      errors.push('عنوان الإشعار يجب أن يكون على الأقل حرفين');
    }
    
    if (title && title.length > 200) {
      errors.push('عنوان الإشعار يجب ألا يتجاوز 200 حرف');
    }
    
    // التحقق من المحتوى
    if (!content || content.trim().length < 2) {
      errors.push('محتوى الإشعار يجب أن يكون على الأقل حرفين');
    }
    
    if (content && content.length > 1000) {
      errors.push('محتوى الإشعار يجب ألا يتجاوز 1000 حرف');
    }
    
    // التحقق من النوع
    const validTypes = [
      'system', 'order_created', 'order_accepted', 'order_picked',
      'order_delivered', 'order_cancelled', 'driver_assigned',
      'driver_arrived', 'payment_success', 'payment_failed',
      'review_reminder', 'promotion', 'announcement', 'security', 'support'
    ];
    
    if (type && !validTypes.includes(type)) {
      errors.push('نوع الإشعار غير صالح');
    }
    
    // التحقق من الأولوية
    if (priority && !['low', 'medium', 'high', 'urgent'].includes(priority)) {
      errors.push('أولوية الإشعار غير صالحة');
    }
    
    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }
    
    next();
  }

  validateChatMessage(req, res, next) {
    const { content, type, conversationId } = req.body;
    
    const errors = [];
    
    // التحقق من المحتوى
    if (!content || content.trim().length === 0) {
      errors.push('محتوى الرسالة مطلوب');
    }
    
    if (content && content.length > 5000) {
      errors.push('الرسالة طويلة جداً (الحد الأقصى 5000 حرف)');
    }
    
    // التحقق من النوع
    const validTypes = [
      'text', 'image', 'video', 'audio', 'file',
      'location', 'contact', 'sticker', 'system',
      'order_update', 'delivery'
    ];
    
    if (type && !validTypes.includes(type)) {
      errors.push('نوع الرسالة غير صالح');
    }
    
    // التحقق من المحادثة
    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      errors.push('المحادثة غير صالحة');
    }
    
    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }
    
    next();
  }

  validatePagination(req, res, next) {
    const { page, limit, sortBy, sortOrder } = req.query;
    
    const errors = [];
    
    // التحقق من الصفحة
    if (page && (isNaN(page) || parseInt(page) < 1)) {
      errors.push('رقم الصفحة يجب أن يكون رقم موجب');
    }
    
    // التحقق من الحد
    if (limit && (isNaN(limit) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
      errors.push('الحد يجب أن يكون بين 1 و 100');
    }
    
    // التحقق من الترتيب
    if (sortOrder && !['asc', 'desc', 'ASC', 'DESC', '-1', '1'].includes(sortOrder)) {
      errors.push('اتجاه الترتيب غير صالح');
    }
    
    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }
    
    next();
  }

  validateFileUpload(req, res, next) {
    if (!req.file && !req.files) {
      return next(new AppError('لم يتم رفع أي ملف', 400));
    }
    
    next();
  }

  sanitizeInput(req, res, next) {
    // تطهير body
    if (req.body) {
      Object.keys(req.body).forEach(key => {
        if (typeof req.body[key] === 'string') {
          // إزالة tags HTML للوقاية من XSS
          req.body[key] = req.body[key]
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .trim();
        }
      });
    }
    
    // تطهير query parameters
    if (req.query) {
      Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = req.query[key]
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .trim();
        }
      });
    }
    
    next();
  }

  validateObjectId(paramName) {
    return (req, res, next) => {
      const id = req.params[paramName];
      
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return next(new AppError(`معرِّف ${paramName} غير صالح`, 400));
      }
      
      next();
    };
  }
}

module.exports = new ValidationMiddleware();