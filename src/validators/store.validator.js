// ============================================
// ملف: src/validators/store.validator.js
// الوصف: مصادقات بيانات المتاجر
// ============================================

const Joi = require('joi');

/**
 * إنشاء متجر جديد
 */
const createStoreSchema = Joi.object({
  name: Joi.string()
    .min(3)
    .max(100)
    .required()
    .messages({
      'string.min': 'اسم المتجر يجب أن يكون {#limit} أحرف على الأقل',
      'string.max': 'اسم المتجر يجب أن لا يتجاوز {#limit} حرف',
      'any.required': 'اسم المتجر مطلوب'
    }),
  
  description: Joi.string()
    .max(500)
    .required()
    .messages({
      'string.max': 'الوصف يجب أن لا يتجاوز {#limit} حرف',
      'any.required': 'الوصف مطلوب'
    }),
  
  type: Joi.string()
    .valid('restaurant', 'cafe', 'fast_food', 'bakery', 'other')
    .required()
    .messages({
      'any.only': 'نوع المتجر غير صالح',
      'any.required': 'نوع المتجر مطلوب'
    }),
  
  phone: Joi.string()
    .pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/)
    .required()
    .messages({
      'string.pattern.base': 'رقم الهاتف غير صالح',
      'any.required': 'رقم الهاتف مطلوب'
    }),
  
  email: Joi.string()
    .email()
    .optional(),
  
  website: Joi.string()
    .uri()
    .optional(),
  
  logo: Joi.string()
    .uri()
    .optional(),
  
  coverImage: Joi.string()
    .uri()
    .optional(),
  
  deliveryFee: Joi.number()
    .min(0)
    .default(0),
  
  minimumOrder: Joi.number()
    .min(0)
    .default(0),
  
  estimatedDeliveryTime: Joi.number()
    .min(5)
    .max(120)
    .default(30),
  
  openingHours: Joi.object({
    monday: Joi.object({ open: Joi.string(), close: Joi.string() }),
    tuesday: Joi.object({ open: Joi.string(), close: Joi.string() }),
    wednesday: Joi.object({ open: Joi.string(), close: Joi.string() }),
    thursday: Joi.object({ open: Joi.string(), close: Joi.string() }),
    friday: Joi.object({ open: Joi.string(), close: Joi.string() }),
    saturday: Joi.object({ open: Joi.string(), close: Joi.string() }),
    sunday: Joi.object({ open: Joi.string(), close: Joi.string() })
  }).optional(),
  
  tags: Joi.array()
    .items(Joi.string())
    .optional(),
  
  isOpen: Joi.boolean()
    .default(true)
});

/**
 * تحديث متجر
 */
const updateStoreSchema = Joi.object({
  name: Joi.string()
    .min(3)
    .max(100)
    .optional(),
  
  description: Joi.string()
    .max(500)
    .optional(),
  
  type: Joi.string()
    .valid('restaurant', 'cafe', 'fast_food', 'bakery', 'other')
    .optional(),
  
  phone: Joi.string()
    .pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/)
    .optional(),
  
  email: Joi.string()
    .email()
    .optional(),
  
  website: Joi.string()
    .uri()
    .optional(),
  
  logo: Joi.string()
    .uri()
    .optional(),
  
  coverImage: Joi.string()
    .uri()
    .optional(),
  
  deliveryFee: Joi.number()
    .min(0)
    .optional(),
  
  minimumOrder: Joi.number()
    .min(0)
    .optional(),
  
  estimatedDeliveryTime: Joi.number()
    .min(5)
    .max(120)
    .optional(),
  
  openingHours: Joi.object().optional(),
  
  tags: Joi.array()
    .items(Joi.string())
    .optional(),
  
  isOpen: Joi.boolean()
    .optional()
});

/**
 * عنوان المتجر
 */
const storeAddressSchema = Joi.object({
  addressLine: Joi.string()
    .min(5)
    .max(200)
    .required(),
  
  city: Joi.string()
    .min(2)
    .max(100)
    .required(),
  
  area: Joi.string()
    .max(100)
    .optional(),
  
  latitude: Joi.number()
    .min(-90)
    .max(90)
    .required(),
  
  longitude: Joi.number()
    .min(-180)
    .max(180)
    .required(),
  
  isMain: Joi.boolean()
    .default(false)
});

module.exports = {
  createStoreSchema,
  updateStoreSchema,
  storeAddressSchema
};