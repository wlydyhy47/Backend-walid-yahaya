// ============================================
// ملف: src/validators/order.validator.js
// الوصف: مصادقات بيانات الطلبات
// الإصدار: 2.0
// ============================================

const Joi = require('joi');

/**
 * إنشاء طلب جديد
 */
const createOrderSchema = Joi.object({
  storeId: Joi.string()
    .required()
    .messages({
      'any.required': 'معرّف المتجر مطلوب'
    }),
  
  items: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string()
          .required()
          .messages({ 'any.required': 'معرّف المنتج مطلوب' }),
        
        quantity: Joi.number()
          .integer()
          .min(1)
          .required()
          .messages({
            'number.min': 'الكمية يجب أن تكون 1 على الأقل',
            'any.required': 'الكمية مطلوبة'
          }),
        
        notes: Joi.string()
          .max(200)
          .optional()
      })
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'يجب إضافة عنصر واحد على الأقل',
      'any.required': 'عناصر الطلب مطلوبة'
    }),
  
  addressId: Joi.string()
    .required()
    .messages({
      'any.required': 'معرّف عنوان التوصيل مطلوب'
    }),
  
  paymentMethod: Joi.string()
    .valid('cash', 'card', 'wallet')
    .default('cash')
    .messages({
      'any.only': 'طريقة الدفع غير صالحة. اختر cash, card, أو wallet'
    }),
  
  deliveryInstructions: Joi.string()
    .max(500)
    .optional(),
  
  couponCode: Joi.string()
    .max(20)
    .optional(),
  
  useLoyaltyPoints: Joi.boolean()
    .default(false)
});

/**
 * تحديث حالة الطلب
 */
const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'accepted', 'ready', 'picked', 'delivered', 'cancelled')
    .required()
    .messages({
      'any.only': 'الحالة غير صالحة',
      'any.required': 'الحالة مطلوبة'
    }),
  
  location: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required()
  }).optional(),
  
  reason: Joi.string()
    .max(500)
    .optional(),
  
  signature: Joi.string()
    .optional()
});

/**
 * إلغاء الطلب
 */
const cancelOrderSchema = Joi.object({
  reason: Joi.string()
    .min(5)
    .max(500)
    .required()
    .messages({
      'string.min': 'سبب الإلغاء يجب أن يكون {#limit} أحرف على الأقل',
      'string.max': 'سبب الإلغاء يجب أن لا يتجاوز {#limit} حرف',
      'any.required': 'سبب الإلغاء مطلوب'
    })
});

/**
 * تقييم الطلب
 */
const rateOrderSchema = Joi.object({
  rating: Joi.number()
    .min(1)
    .max(5)
    .required()
    .messages({
      'number.min': 'التقييم يجب أن يكون بين 1 و 5',
      'number.max': 'التقييم يجب أن يكون بين 1 و 5',
      'any.required': 'التقييم مطلوب'
    }),
  
  comment: Joi.string()
    .max(500)
    .optional()
    .messages({
      'string.max': 'التعليق يجب أن لا يتجاوز {#limit} حرف'
    }),
  
  driverRating: Joi.number()
    .min(1)
    .max(5)
    .optional(),
  
  storeRating: Joi.number()
    .min(1)
    .max(5)
    .optional()
});

/**
 * الإبلاغ عن مشكلة في الطلب
 */
const reportIssueSchema = Joi.object({
  issueType: Joi.string()
    .valid('wrong_item', 'missing_item', 'damaged', 'late', 'other')
    .required()
    .messages({
      'any.only': 'نوع المشكلة غير صالح',
      'any.required': 'نوع المشكلة مطلوب'
    }),
  
  description: Joi.string()
    .min(10)
    .max(1000)
    .required()
    .messages({
      'string.min': 'وصف المشكلة يجب أن يكون {#limit} أحرف على الأقل',
      'string.max': 'وصف المشكلة يجب أن لا يتجاوز {#limit} حرف',
      'any.required': 'وصف المشكلة مطلوب'
    }),
  
  images: Joi.array()
    .items(Joi.string().uri())
    .max(5)
    .optional()
});

/**
 * تعيين مندوب للطلب
 */
const assignDriverSchema = Joi.object({
  driverId: Joi.string()
    .required()
    .messages({
      'any.required': 'معرّف المندوب مطلوب'
    })
});

module.exports = {
  createOrderSchema,
  updateStatusSchema,
  cancelOrderSchema,
  rateOrderSchema,
  reportIssueSchema,
  assignDriverSchema
};