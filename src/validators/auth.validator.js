// ============================================
// ملف: src/validators/auth.validator.js
// الوصف: مصادقات المصادقة والتسجيل
// الإصدار: 3.0
// ============================================

const Joi = require('joi');

/**
 * مصادقة التسجيل
 * @description التحقق من صحة بيانات المستخدم الجديد
 */
const registerSchema = Joi.object({
  name: Joi.string()
    .min(3)
    .max(100)
    .required()
    .messages({
      'string.base': 'الاسم يجب أن يكون نصاً',
      'string.empty': 'الاسم لا يمكن أن يكون فارغاً',
      'string.min': 'الاسم يجب أن يكون {#limit} أحرف على الأقل',
      'string.max': 'الاسم يجب أن لا يتجاوز {#limit} حرف',
      'any.required': 'الاسم مطلوب'
    }),

  phone: Joi.string()
    .pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/)
    .required()
    .messages({
      'string.pattern.base': 'رقم الهاتف غير صالح. يجب أن يكون بصيغة دولية صحيحة',
      'any.required': 'رقم الهاتف مطلوب'
    }),

  email: Joi.string()
    .email()
    .optional()
    .messages({
      'string.email': 'البريد الإلكتروني غير صالح'
    }),

  password: Joi.string()
    .min(6)
    .max(100)
    .required()
    .messages({
      'string.min': 'كلمة المرور يجب أن تكون {#limit} أحرف على الأقل',
      'string.max': 'كلمة المرور يجب أن لا تتجاوز {#limit} حرف',
      'any.required': 'كلمة المرور مطلوبة'
    }),

  role: Joi.string()
    .valid('client', 'driver', 'vendor', 'admin')
    .default('client')
    .messages({
      'any.only': 'الدور غير صالح. يجب أن يكون client, driver, أو vendor'
    }),

  dateOfBirth: Joi.date()
    .optional(),

  gender: Joi.string()
    .valid('male', 'female', 'other')
    .optional(),

  city: Joi.string()
    .max(100)
    .optional(),

  preferences: Joi.object({
    language: Joi.string().valid('ar', 'fr', 'en').default('ar'),
    currency: Joi.string().valid('XOF', 'EUR', 'USD').default('XOF'),
    theme: Joi.string().valid('light', 'dark').default('light'),
    notifications: Joi.object({
      email: Joi.boolean().default(true),
      sms: Joi.boolean().default(true),
      push: Joi.boolean().default(true),
      orderUpdates: Joi.boolean().default(true),
      promotions: Joi.boolean().default(true)
    })
  }).optional()
});

/**
 * مصادقة تسجيل الدخول
 * @description يدعم رقم الهاتف أو البريد الإلكتروني
 */
const loginSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/)
    .optional()
    .messages({
      'string.pattern.base': 'رقم الهاتف غير صالح'
    }),

  email: Joi.string()
    .email()
    .optional()
    .messages({
      'string.email': 'البريد الإلكتروني غير صالح'
    }),

  password: Joi.string()
    .required()
    .min(6)
    .max(100)
    .messages({
      'string.min': 'كلمة المرور يجب أن تكون {#limit} أحرف على الأقل',
      'string.max': 'كلمة المرور يجب أن لا تتجاوز {#limit} حرف',
      'any.required': 'كلمة المرور مطلوبة'
    }),

  deviceId: Joi.string()
    .optional()
    .max(255)
}).or('phone', 'email'); // إما الهاتف أو البريد مطلوب

/**
 * مصادقة تغيير كلمة المرور
 */
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'كلمة المرور الحالية مطلوبة'
    }),

  newPassword: Joi.string()
    .min(6)
    .max(100)
    .required()
    .messages({
      'string.min': 'كلمة المرور الجديدة يجب أن تكون {#limit} أحرف على الأقل',
      'string.max': 'كلمة المرور الجديدة يجب أن لا تتجاوز {#limit} حرف',
      'any.required': 'كلمة المرور الجديدة مطلوبة'
    }),

  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only': 'كلمة المرور غير متطابقة',
      'any.required': 'تأكيد كلمة المرور مطلوب'
    })
});

/**
 * مصادقة إعادة تعيين كلمة المرور
 */
const resetPasswordSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/)
    .required()
    .messages({
      'string.pattern.base': 'رقم الهاتف غير صالح',
      'any.required': 'رقم الهاتف مطلوب'
    }),

  token: Joi.string()
    .required()
    .messages({
      'any.required': 'رمز إعادة التعيين مطلوب'
    }),

  newPassword: Joi.string()
    .min(6)
    .max(100)
    .required()
    .messages({
      'string.min': 'كلمة المرور يجب أن تكون {#limit} أحرف على الأقل',
      'string.max': 'كلمة المرور يجب أن لا تتجاوز {#limit} حرف',
      'any.required': 'كلمة المرور مطلوبة'
    })
});

/**
 * مصادقة إعادة إرسال التحقق
 */
const resendVerificationSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/)
    .required()
    .messages({
      'string.pattern.base': 'رقم الهاتف غير صالح',
      'any.required': 'رقم الهاتف مطلوب'
    })
});

/**
 * مصادقة التحقق من الحساب
 */
const verifyAccountSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/)
    .required()
    .messages({
      'string.pattern.base': 'رقم الهاتف غير صالح',
      'any.required': 'رقم الهاتف مطلوب'
    }),

  code: Joi.string()
    .length(6)
    .pattern(/^[A-Z0-9]{6}$/)
    .required()
    .messages({
      'string.length': 'رمز التحقق يجب أن يكون 6 أحرف',
      'string.pattern.base': 'رمز التحقق يجب أن يحتوي على أحرف وأرقام فقط',
      'any.required': 'رمز التحقق مطلوب'
    })
});

/**
 * مصادقة طلب إعادة تعيين كلمة المرور
 */
const forgotPasswordSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/)
    .required()
    .messages({
      'string.pattern.base': 'رقم الهاتف غير صالح',
      'any.required': 'رقم الهاتف مطلوب'
    })
});

module.exports = {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  resetPasswordSchema,
  resendVerificationSchema,
  verifyAccountSchema,
  forgotPasswordSchema
};