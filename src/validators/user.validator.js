// ============================================
// ملف: src/validators/user.validator.js
// الوصف: مصادقات بيانات المستخدم
// الإصدار: 2.0
// ============================================

const Joi = require('joi');

/**
 * تحديث الملف الشخصي
 */
const updateProfileSchema = Joi.object({
  name: Joi.string()
    .min(3)
    .max(100)
    .optional()
    .messages({
      'string.min': 'الاسم يجب أن يكون {#limit} أحرف على الأقل',
      'string.max': 'الاسم يجب أن لا يتجاوز {#limit} حرف'
    }),

  email: Joi.string()
    .email()
    .optional()
    .messages({
      'string.email': 'البريد الإلكتروني غير صالح'
    }),

  phone: Joi.string()
    .pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/)
    .optional()
    .messages({
      'string.pattern.base': 'رقم الهاتف غير صالح'
    }),

  bio: Joi.string()
    .max(500)
    .optional()
    .messages({
      'string.max': 'السيرة الذاتية يجب أن لا تتجاوز {#limit} حرف'
    }),

  city: Joi.string()
    .max(100)
    .optional(),

  dateOfBirth: Joi.date()
    .optional(),

  gender: Joi.string()
    .valid('male', 'female', 'other', 'prefer-not-to-say')
    .optional(),

  preferences: Joi.object({
    language: Joi.string().valid('ar', 'fr', 'en').optional(),
    currency: Joi.string().valid('XOF', 'EUR', 'USD').optional(),
    theme: Joi.string().valid('light', 'dark').optional(),
    notifications: Joi.object({
      email: Joi.boolean(),
      sms: Joi.boolean(),
      push: Joi.boolean(),
      orderUpdates: Joi.boolean(),
      promotions: Joi.boolean()
    }).optional()
  }).optional()
});

/**
 * تحديث الصورة الشخصية
 */
const avatarSchema = Joi.object({
  image: Joi.string()
    .uri()
    .required()
    .messages({
      'string.uri': 'رابط الصورة غير صالح',
      'any.required': 'الصورة مطلوبة'
    })
});

/**
 * تحديث الحضور
 */
const presenceSchema = Joi.object({
  isOnline: Joi.boolean()
    .required()
    .messages({
      'any.required': 'حالة الاتصال مطلوبة'
    }),

  status: Joi.string()
    .valid('online', 'away', 'busy', 'offline')
    .optional(),

  latitude: Joi.number()
    .min(-90)
    .max(90)
    .optional(),

  longitude: Joi.number()
    .min(-180)
    .max(180)
    .optional(),

  lastSeen: Joi.date()
    .optional()
});

/**
 * إنشاء مستخدم (للمشرف)
 */
const createUserSchema = Joi.object({
  name: Joi.string()
    .min(3)
    .max(100)
    .required(),

  phone: Joi.string()
    .pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/)
    .required(),

  email: Joi.string()
    .email()
    .optional(),

  password: Joi.string()
    .min(6)
    .max(100)
    .required(),

  role: Joi.string()
    .valid('client', 'driver', 'vendor', 'admin')
    .required(),

  isActive: Joi.boolean()
    .default(true),

  isVerified: Joi.boolean()
    .default(false)
});

/**
 * تحديث مستخدم (للمشرف)
 */
const updateUserByAdminSchema = Joi.object({
  name: Joi.string().min(3).max(100).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/).optional(),
  role: Joi.string().valid('client', 'driver', 'vendor', 'admin').optional(),
  isActive: Joi.boolean().optional(),
  isVerified: Joi.boolean().optional(),
  preferences: Joi.object().optional()
});

module.exports = {
  updateProfileSchema,
  avatarSchema,
  presenceSchema,
  createUserSchema,
  updateUserByAdminSchema
};