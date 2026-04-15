const Joi = require('joi');
const addressSchema = Joi.alternatives().try(
  Joi.string().custom((value, helpers) => {
    if (!value || value === '') return {};
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
      return helpers.error('any.invalid');
    } catch (e) {
      return helpers.error('string.json');
    }
  }),
  Joi.object({
    street: Joi.string().max(200).optional().allow('', null),
    city: Joi.string().max(100).optional().allow('', null),
    state: Joi.string().max(100).optional().allow('', null),
    country: Joi.string().max(100).default('Niger').optional(),
    postalCode: Joi.string().max(20).optional().allow('', null),
    latitude: Joi.number().min(-90).max(90).optional().allow('', null),
    longitude: Joi.number().min(-180).max(180).optional().allow('', null),
  }).optional().default({})
);

const deliveryInfoSchema = Joi.alternatives().try(
  Joi.string().custom((value, helpers) => {
    if (!value || value === '') return { hasDelivery: true };
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
      return helpers.error('any.invalid');
    } catch (e) {
      return helpers.error('string.json');
    }
  }),
  Joi.object({
    hasDelivery: Joi.boolean().default(true),
    deliveryFee: Joi.number().min(0).default(0),
    minOrderAmount: Joi.number().min(0).default(0),
    estimatedDeliveryTime: Joi.number().min(5).max(120).default(30),
    deliveryRadius: Joi.number().min(1).max(50).default(10),
    freeDeliveryThreshold: Joi.number().min(0).default(0)
  }).optional().default({})
);

const openingHoursSchema = Joi.alternatives().try(
  Joi.string().custom((value, helpers) => {
    if (!value || value === '') return {};
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
      return helpers.error('any.invalid');
    } catch (e) {
      return helpers.error('string.json');
    }
  }),
  Joi.object({
    monday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }).optional(),
    tuesday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }).optional(),
    wednesday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }).optional(),
    thursday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }).optional(),
    friday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }).optional(),
    saturday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }).optional(),
    sunday: Joi.object({ open: Joi.string(), close: Joi.string(), isOpen: Joi.boolean() }).optional()
  }).optional().default({})
);

const tagsSchema = Joi.alternatives().try(
  Joi.string().custom((value, helpers) => {
    if (!value || value === '') return [];
    if (value.includes(',')) {
      return value.split(',').map(tag => tag.trim()).filter(tag => tag);
    }
    return [value.trim()];
  }),
  Joi.array().items(Joi.string())
).optional().default([]);

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
    .optional()
    .allow('', null),
  website: Joi.string()
    .uri()
    .optional()
    .allow('', null),
  logo: Joi.string()
    .optional()
    .allow('', null),
  coverImage: Joi.string()
    .optional()
    .allow('', null),
  // ✅ حقل التاجر (vendor) - موحد
  vendor: Joi.string()
    .optional()
    .allow('', null),
  vendorId: Joi.string()
    .optional()
    .allow('', null),
  // ✅ السماح بأن تكون القيم فارغة
  address: addressSchema.optional().default({}),
  deliveryInfo: deliveryInfoSchema.optional().default({}),
  openingHours: openingHoursSchema.optional().default({}),
  tags: tagsSchema.optional().default([]),
  isOpen: Joi.boolean()
    .default(true)
    .optional(),
  // ✅ دعم الحقول المنفردة
  hasDelivery: Joi.boolean().optional(),
  deliveryFee: Joi.number().min(0).optional(),
  minOrderAmount: Joi.number().min(0).optional(),
  estimatedDeliveryTime: Joi.number().min(5).max(120).optional(),
  deliveryRadius: Joi.number().min(1).max(50).optional(),
  freeDeliveryThreshold: Joi.number().min(0).optional(),
  street: Joi.string().max(200).optional().allow('', null),
  city: Joi.string().max(100).optional().allow('', null),
  state: Joi.string().max(100).optional().allow('', null),
  country: Joi.string().max(100).optional(),
  postalCode: Joi.string().max(20).optional().allow('', null),
  latitude: Joi.number().min(-90).max(90).optional().allow('', null),
  longitude: Joi.number().min(-180).max(180).optional().allow('', null),
}).unknown(true);

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
    .optional()
    .allow('', null),
  website: Joi.string()
    .uri()
    .optional()
    .allow('', null),
  logo: Joi.string()
    .optional()
    .allow('', null),
  coverImage: Joi.string()
    .optional()
    .allow('', null),
  address: addressSchema.optional(),
  deliveryInfo: deliveryInfoSchema.optional(),
  openingHours: openingHoursSchema.optional(),
  tags: tagsSchema.optional(),
  isOpen: Joi.boolean().optional(),
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
}).unknown(true);

/**
 * عنوان المتجر (للعناوين الإضافية)
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