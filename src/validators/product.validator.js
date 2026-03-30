// ============================================
// ملف: src/validators/product.validator.js
// التعديل: دعم FormData
// ============================================

const Joi = require('joi');

/**
 * إنشاء منتج جديد (معدل لدعم FormData)
 */
const createProductSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'اسم المنتج يجب أن يكون {#limit} أحرف على الأقل',
      'string.max': 'اسم المنتج يجب أن لا يتجاوز {#limit} حرف',
      'any.required': 'اسم المنتج مطلوب'
    }),
  
  description: Joi.string()
    .max(500)
    .optional()
    .allow('', null),
  
  price: Joi.number()
    .positive()
    .required()
    .messages({
      'number.positive': 'السعر يجب أن يكون موجباً',
      'any.required': 'السعر مطلوب'
    }),
  
  discountedPrice: Joi.number()
    .positive()
    .optional()
    .allow('', null),
  
  category: Joi.string()
    .required()
    .messages({
      'any.required': 'التصنيف مطلوب'
    }),
  
  // تعديل: image اختياري ويمكن أن يكون file أو string
  image: Joi.alternatives()
    .try(
      Joi.string().uri(),
      Joi.any() // للـ file
    )
    .optional(),
  
  preparationTime: Joi.number()
    .min(0)
    .max(60)
    .default(15)
    .optional()
    .allow('', null),
  
  isAvailable: Joi.boolean()
    .default(true)
    .optional()
    .allow('', null),
  
  // الخصائص الفردية (للتوافق مع الواجهة القديمة)
  isVegetarian: Joi.boolean()
    .default(false)
    .optional()
    .allow('', null),
  
  isVegan: Joi.boolean()
    .default(false)
    .optional()
    .allow('', null),
  
  isGlutenFree: Joi.boolean()
    .default(false)
    .optional()
    .allow('', null),
  
  spicyLevel: Joi.number()
    .min(0)
    .max(3)
    .default(0)
    .optional()
    .allow('', null),
  
  calories: Joi.number()
    .min(0)
    .optional()
    .allow('', null),
  
  // ingredients: يمكن أن يكون array أو string
  ingredients: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string()),
      Joi.string()
    )
    .optional()
    .allow('', null),
  
  options: Joi.alternatives()
    .try(
      Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          choices: Joi.array().items(
            Joi.object({
              name: Joi.string().required(),
              price: Joi.number().min(0).required()
            })
          ).min(1).required()
        })
      ),
      Joi.string()
    )
    .optional()
    .allow('', null),
  
  tags: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string()),
      Joi.string()
    )
    .optional()
    .allow('', null),
  
  // inventory: يمكن أن يكون object أو string (JSON)
  inventory: Joi.alternatives()
    .try(
      Joi.object({
        quantity: Joi.number().integer().min(0).default(0),
        unit: Joi.string().default('piece'),
        lowStockThreshold: Joi.number().integer().min(0).default(5),
        trackInventory: Joi.boolean().default(false)
      }),
      Joi.string()
    )
    .optional()
    .allow('', null),
  
  // attributes: يمكن أن يكون object أو string (JSON)
  attributes: Joi.alternatives()
    .try(
      Joi.object({
        spicyLevel: Joi.number().min(0).max(3).default(0),
        isVegetarian: Joi.boolean().default(false),
        isVegan: Joi.boolean().default(false),
        isGlutenFree: Joi.boolean().default(false),
        isOrganic: Joi.boolean().default(false)
      }),
      Joi.string()
    )
    .optional()
    .allow('', null),
  
  nutritionalInfo: Joi.alternatives()
    .try(
      Joi.object({
        calories: Joi.number().min(0).optional(),
        protein: Joi.number().min(0).optional(),
        carbs: Joi.number().min(0).optional(),
        fat: Joi.number().min(0).optional(),
        allergens: Joi.array().items(Joi.string()).optional()
      }),
      Joi.string()
    )
    .optional()
    .allow('', null),
  
  // إضافة store (للمشرف)
  store: Joi.string()
    .optional()
    .allow('', null),
  
  storeId: Joi.string()
    .optional()
    .allow('', null),
});

/**
 * تحديث منتج (معدل لدعم FormData)
 */
const updateProductSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .optional(),
  
  description: Joi.string()
    .max(500)
    .optional()
    .allow('', null),
  
  price: Joi.number()
    .positive()
    .optional(),
  
  discountedPrice: Joi.number()
    .positive()
    .optional()
    .allow('', null),
  
  category: Joi.string()
    .optional(),
  
  image: Joi.alternatives()
    .try(
      Joi.string().uri(),
      Joi.any()
    )
    .optional(),
  
  preparationTime: Joi.number()
    .min(0)
    .max(60)
    .optional()
    .allow('', null),
  
  isAvailable: Joi.boolean()
    .optional()
    .allow('', null),
  
  isVegetarian: Joi.boolean()
    .optional()
    .allow('', null),
  
  isVegan: Joi.boolean()
    .optional()
    .allow('', null),
  
  isGlutenFree: Joi.boolean()
    .optional()
    .allow('', null),
  
  spicyLevel: Joi.number()
    .min(0)
    .max(3)
    .optional()
    .allow('', null),
  
  calories: Joi.number()
    .min(0)
    .optional()
    .allow('', null),
  
  ingredients: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string()),
      Joi.string()
    )
    .optional()
    .allow('', null),
  
  options: Joi.alternatives()
    .try(
      Joi.array().items(Joi.object()),
      Joi.string()
    )
    .optional()
    .allow('', null),
  
  tags: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string()),
      Joi.string()
    )
    .optional()
    .allow('', null),
  
  inventory: Joi.alternatives()
    .try(
      Joi.object(),
      Joi.string()
    )
    .optional()
    .allow('', null),
  
  attributes: Joi.alternatives()
    .try(
      Joi.object(),
      Joi.string()
    )
    .optional()
    .allow('', null),
  
  nutritionalInfo: Joi.alternatives()
    .try(
      Joi.object(),
      Joi.string()
    )
    .optional()
    .allow('', null),
});

/**
 * تحديث المخزون
 */
const updateInventorySchema = Joi.object({
  quantity: Joi.number()
    .integer()
    .min(0)
    .required()
    .messages({
      'number.integer': 'الكمية يجب أن تكون عدداً صحيحاً',
      'number.min': 'الكمية يجب أن تكون 0 أو أكثر',
      'any.required': 'الكمية مطلوبة'
    }),
  
  operation: Joi.string()
    .valid('set', 'add', 'subtract')
    .default('set')
    .messages({
      'any.only': 'العملية يجب أن تكون set, add, أو subtract'
    }),
  
  unit: Joi.string()
    .optional()
    .allow('', null),
  
  lowStockThreshold: Joi.number()
    .integer()
    .min(0)
    .optional()
    .allow('', null)
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  updateInventorySchema
};