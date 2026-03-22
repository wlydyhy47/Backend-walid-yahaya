// ============================================
// ملف: src/validators/address.validator.js
// الوصف: مصادقات بيانات العناوين
// ============================================

const Joi = require('joi');

/**
 * إنشاء عنوان جديد
 */
const createAddressSchema = Joi.object({
  label: Joi.string()
    .valid('home', 'work', 'other')
    .default('home')
    .messages({
      'any.only': 'التصنيف يجب أن يكون home, work, أو other'
    }),
  
  addressLine: Joi.string()
    .min(5)
    .max(200)
    .required()
    .messages({
      'string.min': 'العنوان يجب أن يكون {#limit} أحرف على الأقل',
      'string.max': 'العنوان يجب أن لا يتجاوز {#limit} حرف',
      'any.required': 'العنوان مطلوب'
    }),
  
  city: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'المدينة يجب أن تكون {#limit} أحرف على الأقل',
      'string.max': 'المدينة يجب أن لا تتجاوز {#limit} حرف',
      'any.required': 'المدينة مطلوبة'
    }),
  
  area: Joi.string()
    .max(100)
    .optional(),
  
  building: Joi.string()
    .max(50)
    .optional(),
  
  floor: Joi.string()
    .max(10)
    .optional(),
  
  apartment: Joi.string()
    .max(10)
    .optional(),
  
  instructions: Joi.string()
    .max(200)
    .optional(),
  
  latitude: Joi.number()
    .min(-90)
    .max(90)
    .required()
    .messages({
      'number.min': 'خط العرض يجب أن يكون بين -90 و 90',
      'number.max': 'خط العرض يجب أن يكون بين -90 و 90',
      'any.required': 'خط العرض مطلوب'
    }),
  
  longitude: Joi.number()
    .min(-180)
    .max(180)
    .required()
    .messages({
      'number.min': 'خط الطول يجب أن يكون بين -180 و 180',
      'number.max': 'خط الطول يجب أن يكون بين -180 و 180',
      'any.required': 'خط الطول مطلوب'
    }),
  
  isDefault: Joi.boolean()
    .default(false)
});

/**
 * تحديث عنوان
 */
const updateAddressSchema = Joi.object({
  label: Joi.string()
    .valid('home', 'work', 'other')
    .optional(),
  
  addressLine: Joi.string()
    .min(5)
    .max(200)
    .optional(),
  
  city: Joi.string()
    .min(2)
    .max(100)
    .optional(),
  
  area: Joi.string()
    .max(100)
    .optional(),
  
  building: Joi.string()
    .max(50)
    .optional(),
  
  floor: Joi.string()
    .max(10)
    .optional(),
  
  apartment: Joi.string()
    .max(10)
    .optional(),
  
  instructions: Joi.string()
    .max(200)
    .optional(),
  
  latitude: Joi.number()
    .min(-90)
    .max(90)
    .optional(),
  
  longitude: Joi.number()
    .min(-180)
    .max(180)
    .optional(),
  
  isDefault: Joi.boolean()
    .optional()
});

module.exports = {
  createAddressSchema,
  updateAddressSchema
};