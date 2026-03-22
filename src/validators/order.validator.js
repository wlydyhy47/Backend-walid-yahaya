// ============================================
// ملف: src/validators/order.validator.js
// الوصف: مصادقات بيانات الطلبات
// ============================================

const Joi = require('joi');

/**
 * إنشاء طلب جديد
 */
const createOrderSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        item: Joi.string()
          .required()
          .messages({ 'any.required': 'معرّف العنصر مطلوب' }),
        
        name: Joi.string()
          .required()
          .messages({ 'any.required': 'اسم العنصر مطلوب' }),
        
        price: Joi.number()
          .positive()
          .required()
          .messages({
            'number.positive': 'السعر يجب أن يكون موجباً',
            'any.required': 'السعر مطلوب'
          }),
        
        qty: Joi.number()
          .integer()
          .min(1)
          .required()
          .messages({
            'number.min': 'الكمية يجب أن تكون 1 على الأقل',
            'any.required': 'الكمية مطلوبة'
          }),
        
        notes: Joi.string()
          .max(200)
          .optional(),
        
        options: Joi.array()
          .items(Joi.string())
          .optional()
      })
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'يجب إضافة عنصر واحد على الأقل',
      'any.required': 'عناصر الطلب مطلوبة'
    }),
  
  totalPrice: Joi.number()
    .positive()
    .required()
    .messages({
      'number.positive': 'السعر الإجمالي يجب أن يكون موجباً',
      'any.required': 'السعر الإجمالي مطلوب'
    }),
  
  pickupAddress: Joi.string()
    .required()
    .messages({ 'any.required': 'عنوان الاستلام مطلوب' }),
  
  deliveryAddress: Joi.string()
    .required()
    .messages({ 'any.required': 'عنوان التوصيل مطلوب' }),
  
  store: Joi.string()
    .required()
    .messages({ 'any.required': 'المتجر مطلوب' }),
  
  notes: Joi.string()
    .max(500)
    .optional(),
  
  paymentMethod: Joi.string()
    .valid('cash', 'card', 'wallet')
    .default('cash')
    .messages({
      'any.only': 'طريقة الدفع غير صالحة. اختر cash, card, أو wallet'
    }),
  
  scheduledTime: Joi.date()
    .min('now')
    .optional()
    .messages({
      'date.min': 'الوقت المحدد يجب أن يكون في المستقبل'
    })
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
    })
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
  
  rateDriver: Joi.number()
    .min(1)
    .max(5)
    .optional(),
  
  rateStore: Joi.number()
    .min(1)
    .max(5)
    .optional()
});

/**
 * الإبلاغ عن مشكلة في الطلب
 */
const reportIssueSchema = Joi.object({
  issue: Joi.string()
    .valid('late_delivery', 'wrong_item', 'missing_item', 'bad_quality', 'other')
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