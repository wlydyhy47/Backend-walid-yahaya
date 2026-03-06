// src/validators/auth.validator.js
const Joi = require('joi');

// التحقق من صحة بيانات التسجيل
const registerSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'الاسم يجب أن يكون على الأقل 2 أحرف',
      'string.max': 'الاسم يجب أن لا يتجاوز 100 حرف',
      'any.required': 'الاسم مطلوب'
    }),

  phone: Joi.string()
    .pattern(/^\+?[\d\s\-\(\)]+$/)
    .min(8)
    .max(15)
    .required()
    .messages({
      'string.pattern.base': 'رقم الهاتف غير صالح',
      'any.required': 'رقم الهاتف مطلوب'
    }),

  password: Joi.string()
    .min(6)
    .max(100)
    .required()
    .messages({
      'string.min': 'كلمة المرور يجب أن تكون على الأقل 6 أحرف',
      'any.required': 'كلمة المرور مطلوبة'
    }),

  email: Joi.string()
    .email()
    .optional()
    .allow('')
    .messages({
      'string.email': 'البريد الإلكتروني غير صالح'
    }),

  role: Joi.string()
    .valid('client', 'driver', 'admin')
    .optional()
    .default('client')
});

// التحقق من صحة بيانات تسجيل الدخول
const loginSchema = Joi.object({
  phone: Joi.string()
    .required()
    .messages({
      'any.required': 'رقم الهاتف مطلوب'
    }),

  password: Joi.string()
    .required()
    .messages({
      'any.required': 'كلمة المرور مطلوبة'
    })
});

module.exports = {
  registerSchema,
  loginSchema
};

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    'any.required': 'كلمة المرور الحالية مطلوبة'
  }),
  newPassword: Joi.string().min(6).required().messages({
    'string.min': 'كلمة المرور الجديدة يجب أن تكون على الأقل 6 أحرف',
    'any.required': 'كلمة المرور الجديدة مطلوبة'
  })
});