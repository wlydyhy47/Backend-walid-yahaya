// ============================================
// ملف: src/middlewares/validation.middleware.js (محدث)
// الوصف: التحقق من صحة البيانات المدخلة
// ============================================

const { AppError } = require('./errorHandler.middleware');
const mongoose = require('mongoose');
const { businessLogger } = require("../utils/logger.util");

class ValidationMiddleware {
  // ========== 1. التحقق من المستخدمين ==========

  /**
   * التحقق من صحة بيانات التسجيل
   */
  validateRegister(req, res, next) {
    const { name, phone, password, email, role } = req.body;

    const errors = [];

    // التحقق من الاسم
    if (!name || name.trim().length < 2) {
      errors.push('الاسم يجب أن يكون على الأقل حرفين');
    } else if (name && name.trim().length > 100) {
      errors.push('الاسم يجب ألا يتجاوز 100 حرف');
    } else if (!/^[\u0600-\u06FFa-zA-Z\s]+$/.test(name)) {
      errors.push('الاسم يجب أن يحتوي على أحرف فقط');
    }

    // التحقق من الهاتف
    if (!phone) {
      errors.push('رقم الهاتف مطلوب');
    } else {
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        errors.push('رقم الهاتف غير صالح (يجب أن يبدأ برمز الدولة)');
      }
    }

    // التحقق من كلمة المرور
    if (!password) {
      errors.push('كلمة المرور مطلوبة');
    } else if (password.length < 6) {
      errors.push('كلمة المرور يجب أن تكون على الأقل 6 أحرف');
    } else if (password.length > 100) {
      errors.push('كلمة المرور يجب ألا تتجاوز 100 حرف');
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      errors.push('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم على الأقل');
    }

    // التحقق من البريد الإلكتروني
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push('البريد الإلكتروني غير صالح');
      }
    }

    // التحقق من الدور
    if (role && !['client', 'driver', 'admin', 'store_owner'].includes(role)) {
      errors.push('الدور غير صالح');
    }

    if (errors.length > 0) {
      businessLogger.warn('Registration validation failed', { errors });
      return next(new AppError(errors.join(' | '), 400));
    }

    next();
  }

  /**
   * التحقق من صحة بيانات تسجيل الدخول
   */
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

  /**
   * التحقق من صحة تغيير كلمة المرور
   */
  validateChangePassword(req, res, next) {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    const errors = [];

    if (!currentPassword) {
      errors.push('كلمة المرور الحالية مطلوبة');
    }

    if (!newPassword) {
      errors.push('كلمة المرور الجديدة مطلوبة');
    } else if (newPassword.length < 6) {
      errors.push('كلمة المرور الجديدة يجب أن تكون على الأقل 6 أحرف');
    }

    if (!confirmPassword) {
      errors.push('تأكيد كلمة المرور مطلوب');
    } else if (newPassword !== confirmPassword) {
      errors.push('كلمة المرور الجديدة وتأكيدها غير متطابقين');
    }

    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }

    next();
  }

  // ========== 2. التحقق من الطلبات ==========

  /**
   * التحقق من صحة بيانات الطلب
   */
  validateOrder(req, res, next) {
    const { items, totalPrice, pickupAddress, deliveryAddress, store } = req.body;

    const errors = [];

    // التحقق من العناصر
    if (!items || !Array.isArray(items) || items.length === 0) {
      errors.push('يجب إضافة عناصر للطلب');
    } else {
      items.forEach((item, index) => {
        if (!item.name) {
          errors.push(`العنصر ${index + 1}: الاسم مطلوب`);
        }
        if (!item.qty || item.qty <= 0) {
          errors.push(`العنصر ${index + 1}: الكمية يجب أن تكون أكبر من الصفر`);
        }
        if (!item.price || item.price < 0) {
          errors.push(`العنصر ${index + 1}: السعر غير صالح`);
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
    if (!store || !mongoose.Types.ObjectId.isValid(store)) {
      errors.push('المطعم غير صالح');
    }

    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }

    next();
  }

  /**
   * التحقق من صحة تحديث حالة الطلب
   */
  validateOrderStatus(req, res, next) {
    const { status } = req.body;

    const validStatuses = ['pending', 'accepted', 'picked', 'delivered', 'cancelled'];

    if (!status || !validStatuses.includes(status)) {
      return next(new AppError(`حالة الطلب غير صالحة. الحالات المسموحة: ${validStatuses.join(', ')}`, 400));
    }

    next();
  }

  // ========== 3. التحقق من المطاعم ==========

  /**
   * التحقق من صحة بيانات المطعم
   */
  validateStore(req, res, next) {
    const { name, type, phone, email, deliveryFee, minOrderAmount } = req.body;

    const errors = [];

    // التحقق من الاسم
    if (!name || name.trim().length < 2) {
      errors.push('اسم المطعم يجب أن يكون على الأقل حرفين');
    } else if (name && name.trim().length > 100) {
      errors.push('اسم المطعم يجب ألا يتجاوز 100 حرف');
    }

    // التحقق من النوع
    if (type && !['store', 'cafe', 'bakery', 'fast-food', 'grocery', 'pharmacy', 'other'].includes(type)) {
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
    if (deliveryFee && (isNaN(deliveryFee) || deliveryFee < 0)) {
      errors.push('رسوم التوصيل يجب أن تكون رقماً موجباً');
    }

    // التحقق من الحد الأدنى للطلب
    if (minOrderAmount && (isNaN(minOrderAmount) || minOrderAmount < 0)) {
      errors.push('الحد الأدنى للطلب يجب أن يكون رقماً موجباً');
    }

    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }

    next();
  }

  // ========== 4. التحقق من العناصر ==========

  /**
   * التحقق من صحة بيانات العنصر
   */
  validateItem(req, res, next) {
    const { name, price, store, category } = req.body;

    const errors = [];

    // التحقق من الاسم
    if (!name || name.trim().length < 2) {
      errors.push('اسم العنصر يجب أن يكون على الأقل حرفين');
    }

    // التحقق من السعر
    if (!price || isNaN(price) || price <= 0) {
      errors.push('سعر العنصر غير صالح');
    }

    // التحقق من المطعم
    if (!store || !mongoose.Types.ObjectId.isValid(store)) {
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

  // ========== 5. التحقق من العناوين ==========

  /**
   * التحقق من صحة بيانات العنوان
   */
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

    // التحقق من الإحداثيات
    if (latitude && (isNaN(latitude) || latitude < -90 || latitude > 90)) {
      errors.push('خط العرض غير صالح');
    }

    if (longitude && (isNaN(longitude) || longitude < -180 || longitude > 180)) {
      errors.push('خط الطول غير صالح');
    }

    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }

    next();
  }

  // ========== 6. التحقق من التقييمات ==========

  /**
   * التحقق من صحة بيانات التقييم
   */
  validateReview(req, res, next) {
    const { rating, comment } = req.body;

    const errors = [];

    // التحقق من التقييم
    if (!rating || isNaN(rating) || rating < 1 || rating > 5) {
      errors.push('التقييم يجب أن يكون بين 1 و 5');
    }

    // التحقق من التعليق
    if (comment && comment.length > 1000) {
      errors.push('التعليق يجب ألا يتجاوز 1000 حرف');
    }

    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }

    next();
  }

  // ========== 7. التحقق من الإشعارات ==========

  /**
   * التحقق من صحة بيانات الإشعار
   */
  validateNotification(req, res, next) {
    const { title, content, type, priority } = req.body;

    const errors = [];

    // التحقق من العنوان
    if (!title || title.trim().length < 2) {
      errors.push('عنوان الإشعار يجب أن يكون على الأقل حرفين');
    } else if (title && title.length > 200) {
      errors.push('عنوان الإشعار يجب ألا يتجاوز 200 حرف');
    }

    // التحقق من المحتوى
    if (!content || content.trim().length < 2) {
      errors.push('محتوى الإشعار يجب أن يكون على الأقل حرفين');
    } else if (content && content.length > 1000) {
      errors.push('محتوى الإشعار يجب ألا يتجاوز 1000 حرف');
    }

    // التحقق من النوع
    const validTypes = [
      'system', 'order_created', 'order_accepted', 'order_picked',
      'order_delivered', 'order_cancelled', 'driver_assigned',
      'driver_arrived', 'payment_success', 'payment_failed',
      'review_reminder', 'promotion', 'announcement', 'security',
      'support', 'welcome', 'password_changed', 'profile_updated',
      'new_message', 'loyalty_points_earned', 'loyalty_points_redeemed'
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

  // ========== 8. التحقق من الدردشة ==========

  /**
   * التحقق من صحة رسالة الدردشة
   */
  validateChatMessage(req, res, next) {
    const { content, type, conversationId } = req.body;

    const errors = [];

    // التحقق من المحتوى
    if (!content || content.trim().length === 0) {
      errors.push('محتوى الرسالة مطلوب');
    } else if (content && content.length > 5000) {
      errors.push('الرسالة طويلة جداً (الحد الأقصى 5000 حرف)');
    }

    // التحقق من النوع
    const validTypes = [
      'text', 'image', 'video', 'audio', 'file',
      'location', 'contact', 'sticker', 'system',
      'order_update', 'delivery', 'payment'
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

  // ========== 9. التحقق من Pagination ==========

  /**
   * التحقق من صحة معاملات pagination
   */
  validatePagination(req, res, next) {
    const { page, limit, sortBy, sortOrder } = req.query;

    const errors = [];

    // التحقق من الصفحة
    if (page && (isNaN(page) || parseInt(page) < 1)) {
      errors.push('رقم الصفحة يجب أن يكون رقماً موجباً');
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

  // ========== 10. التحقق من الملفات ==========

  /**
   * التحقق من رفع الملفات
   */
  validateFileUpload(req, res, next) {
    if (!req.file && !req.files) {
      return next(new AppError('لم يتم رفع أي ملف', 400));
    }

    next();
  }

  // ========== 11. التحقق من ObjectId ==========

  /**
   * التحقق من صحة ObjectId
   */
  validateObjectId(paramName) {
    return (req, res, next) => {
      const id = req.params[paramName];

      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return next(new AppError(`معرِّف ${paramName} غير صالح`, 400));
      }

      next();
    };
  }

  // ========== 12. تطهير المدخلات ==========

  /**
   * تطهير المدخلات من XSS
   */
  sanitizeInput(req, res, next) {
    // تطهير body
    if (req.body) {
      Object.keys(req.body).forEach(key => {
        if (typeof req.body[key] === 'string') {
          // إزالة tags HTML للوقاية من XSS
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

    // تطهير query parameters
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
  }

  // ========== 13. التحقق من نقاط الولاء ==========

  /**
   * التحقق من صحة استبدال النقاط
   */
  validatePointsRedemption(req, res, next) {
    const { amount, rewardId } = req.body;

    const errors = [];

    if (!amount || isNaN(amount) || amount <= 0) {
      errors.push('كمية النقاط غير صالحة');
    }

    if (!rewardId) {
      errors.push('معرف المكافأة مطلوب');
    }

    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }

    next();
  }

  // ========== 14. التحقق من موقع المندوب ==========

  /**
   * التحقق من صحة موقع المندوب
   */
  validateDriverLocation(req, res, next) {
    const { latitude, longitude } = req.body;

    const errors = [];

    if (!latitude || isNaN(latitude) || latitude < -90 || latitude > 90) {
      errors.push('خط العرض غير صالح');
    }

    if (!longitude || isNaN(longitude) || longitude < -180 || longitude > 180) {
      errors.push('خط الطول غير صالح');
    }

    if (errors.length > 0) {
      return next(new AppError(errors.join(' | '), 400));
    }

    next();
  }
}

module.exports = new ValidationMiddleware();