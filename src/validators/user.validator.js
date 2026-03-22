// ============================================
// ملف: src/validators/user.validator.js
// الوصف: مصادقات بيانات المستخدم
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
  
  image: Joi.string()
    .uri()
    .optional()
    .messages({
      'string.uri': 'رابط الصورة غير صالح'
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
  
  preferredLanguage: Joi.string()
    .valid('ar', 'en', 'fr')
    .default('ar')
    .messages({
      'any.only': 'اللغة المفضلة يجب أن تكون ar, en, أو fr'
    }),
  
  notificationPreferences: Joi.object({
    email: Joi.boolean(),
    sms: Joi.boolean(),
    push: Joi.boolean()
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
    .valid('client', 'driver', 'store_owner', 'admin')
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
  role: Joi.string().valid('client', 'driver', 'store_owner', 'admin').optional(),
  isActive: Joi.boolean().optional(),
  isVerified: Joi.boolean().optional()
});

module.exports = {
  updateProfileSchema,
  avatarSchema,
  presenceSchema,
  createUserSchema,
  updateUserByAdminSchema
};