// ============================================
// ملف: src/validators/product.validator.js
// الوصف: مصادقات بيانات المنتجات
// ============================================

const Joi = require('joi');

/**
 * إنشاء منتج جديد
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
    .optional(),
  
  price: Joi.number()
    .positive()
    .required()
    .messages({
      'number.positive': 'السعر يجب أن يكون موجباً',
      'any.required': 'السعر مطلوب'
    }),
  
  category: Joi.string()
    .required()
    .messages({
      'any.required': 'التصنيف مطلوب'
    }),
  
  image: Joi.string()
    .uri()
    .optional(),
  
  preparationTime: Joi.number()
    .min(0)
    .max(60)
    .default(15),
  
  isAvailable: Joi.boolean()
    .default(true),
  
  isVegetarian: Joi.boolean()
    .default(false),
  
  isVegan: Joi.boolean()
    .default(false),
  
  isGlutenFree: Joi.boolean()
    .default(false),
  
  spicyLevel: Joi.number()
    .min(0)
    .max(3)
    .default(0)
    .messages({
      'number.min': 'مستوى الحرارة يجب أن يكون بين 0 و 3',
      'number.max': 'مستوى الحرارة يجب أن يكون بين 0 و 3'
    }),
  
  calories: Joi.number()
    .min(0)
    .optional(),
  
  ingredients: Joi.array()
    .items(Joi.string())
    .optional(),
  
  options: Joi.array()
    .items(
      Joi.object({
        name: Joi.string()
          .required()
          .messages({ 'any.required': 'اسم الخيار مطلوب' }),
        
        choices: Joi.array()
          .items(
            Joi.object({
              name: Joi.string()
                .required()
                .messages({ 'any.required': 'اسم الاختيار مطلوب' }),
              
              price: Joi.number()
                .min(0)
                .required()
                .messages({
                  'number.min': 'السعر يجب أن يكون 0 أو أكثر',
                  'any.required': 'السعر مطلوب'
                })
            })
          )
          .min(1)
          .required()
      })
    )
    .optional(),
  
  tags: Joi.array()
    .items(Joi.string())
    .optional()
});

/**
 * تحديث منتج
 */
const updateProductSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .optional(),
  
  description: Joi.string()
    .max(500)
    .optional(),
  
  price: Joi.number()
    .positive()
    .optional(),
  
  category: Joi.string()
    .optional(),
  
  image: Joi.string()
    .uri()
    .optional(),
  
  preparationTime: Joi.number()
    .min(0)
    .max(60)
    .optional(),
  
  isAvailable: Joi.boolean()
    .optional(),
  
  isVegetarian: Joi.boolean()
    .optional(),
  
  isVegan: Joi.boolean()
    .optional(),
  
  isGlutenFree: Joi.boolean()
    .optional(),
  
  spicyLevel: Joi.number()
    .min(0)
    .max(3)
    .optional(),
  
  calories: Joi.number()
    .min(0)
    .optional(),
  
  ingredients: Joi.array()
    .items(Joi.string())
    .optional(),
  
  options: Joi.array()
    .items(Joi.object())
    .optional(),
  
  tags: Joi.array()
    .items(Joi.string())
    .optional()
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
  
  lowStockThreshold: Joi.number()
    .integer()
    .min(0)
    .optional()
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  updateInventorySchema
};