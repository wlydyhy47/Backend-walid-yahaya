// ============================================
// ملف: src/validators/store.validator.js
// الوصف: مصادقات بيانات المتاجر
// الإصدار: 2.0
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
  
  category: Joi.string()
    .valid('restaurant', 'cafe', 'fast_food', 'bakery', 'grocery', 'supermarket', 'pharmacy', 'clothing', 'electronics', 'other')
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
  
  address: Joi.object({
    street: Joi.string().max(200),
    city: Joi.string().max(100),
    state: Joi.string().max(100),
    country: Joi.string().max(100).default('Niger'),
    postalCode: Joi.string().max(20)
  }).optional(),
  
  deliveryInfo: Joi.object({
    hasDelivery: Joi.boolean().default(true),
    deliveryFee: Joi.number().min(0).default(0),
    minOrderAmount: Joi.number().min(0).default(0),
    estimatedDeliveryTime: Joi.number().min(5).max(120).default(30),
    deliveryRadius: Joi.number().min(1).max(50).default(10),
    freeDeliveryThreshold: Joi.number().min(0).default(0)
  }).optional(),
  
  openingHours: Joi.object({
    monday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }),
    tuesday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }),
    wednesday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }),
    thursday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }),
    friday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }),
    saturday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }),
    sunday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() })
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
  
  category: Joi.string()
    .valid('restaurant', 'cafe', 'fast_food', 'bakery', 'grocery', 'supermarket', 'pharmacy', 'clothing', 'electronics', 'other')
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
  
  address: Joi.object({
    street: Joi.string().max(200),
    city: Joi.string().max(100),
    state: Joi.string().max(100),
    country: Joi.string().max(100),
    postalCode: Joi.string().max(20)
  }).optional(),
  
  deliveryInfo: Joi.object({
    hasDelivery: Joi.boolean(),
    deliveryFee: Joi.number().min(0),
    minOrderAmount: Joi.number().min(0),
    estimatedDeliveryTime: Joi.number().min(5).max(120),
    deliveryRadius: Joi.number().min(1).max(50),
    freeDeliveryThreshold: Joi.number().min(0)
  }).optional(),
  
  openingHours: Joi.object().optional(),
  
  tags: Joi.array()
    .items(Joi.string())
    .optional(),
  
  isOpen: Joi.boolean()
    .optional(),
  
  settings: Joi.object({
    autoAcceptOrders: Joi.boolean(),
    preparationTimeBuffer: Joi.number().min(0).max(30),
    maxOrdersPerHour: Joi.number().min(1).max(200),
    currency: Joi.string(),
    taxRate: Joi.number().min(0).max(100),
    notifications: Joi.object({
      email: Joi.boolean(),
      push: Joi.boolean(),
      sms: Joi.boolean()
    })
  }).optional()
});

/**
 * عنوان المتجر
 */
const storeAddressSchema = Joi.object({
  label: Joi.string()
    .default('Main Branch'),
  
  addressLine: Joi.string()
    .min(5)
    .max(200)
    .required(),
  
  city: Joi.string()
    .min(2)
    .max(100)
    .required(),
  
  state: Joi.string()
    .max(100)
    .optional(),
  
  country: Joi.string()
    .default('Niger'),
  
  postalCode: Joi.string()
    .max(20)
    .optional(),
  
  latitude: Joi.number()
    .min(-90)
    .max(90)
    .required(),
  
  longitude: Joi.number()
    .min(-180)
    .max(180)
    .required(),
  
  phone: Joi.string()
    .pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/)
    .optional(),
  
  isDefault: Joi.boolean()
    .default(false),
  
  isActive: Joi.boolean()
    .default(true)
});

module.exports = {
  createStoreSchema,
  updateStoreSchema,
  storeAddressSchema
};