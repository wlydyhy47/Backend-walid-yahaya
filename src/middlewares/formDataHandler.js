// src/middlewares/formDataHandler.js
const { AppError } = require('./errorHandler.middleware');

/**
 * Middleware للتعامل مع FormData وتحويل JSON strings إلى Objects
 * يجب أن يأتي بعد multer وقبل validate
 */
const handleFormData = (req, res, next) => {
  try {
    // التحقق من وجود بيانات
    if (!req.body || Object.keys(req.body).length === 0) {
      console.log('⚠️ No body data received');
      return next();
    }

    console.log('📥 Raw req.body before processing:', req.body);
    console.log('📥 req.files:', req.files);

    // ========== 1. تحويل JSON strings إلى Objects ==========
    const jsonFields = ['address', 'deliveryInfo', 'openingHours'];
    
    jsonFields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        try {
          // محاولة تحويل الـ string إلى object
          const parsed = JSON.parse(req.body[field]);
          req.body[field] = parsed;
          console.log(`✅ Parsed ${field}:`, parsed);
        } catch (e) {
          console.warn(`⚠️ Failed to parse ${field}:`, e.message);
          // إذا فشل الـ parse، نحذف الحقل أو نتركه كـ string
          // delete req.body[field];
        }
      }
    });

    // ========== 2. تحويل التاغات ==========
    if (req.body.tags && typeof req.body.tags === 'string') {
      if (req.body.tags.includes(',')) {
        req.body.tags = req.body.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      } else if (req.body.tags.trim()) {
        req.body.tags = [req.body.tags.trim()];
      } else {
        req.body.tags = [];
      }
      console.log('✅ Parsed tags:', req.body.tags);
    }

    // ========== 3. تحويل القيم الرقمية ==========
    const numberFields = [
      'deliveryFee', 'minOrderAmount', 'estimatedDeliveryTime', 
      'deliveryRadius', 'freeDeliveryThreshold', 'latitude', 'longitude',
      'price', 'discountedPrice', 'preparationTime', 'calories'
    ];
    
    numberFields.forEach(field => {
      if (req.body[field] !== undefined && req.body[field] !== '') {
        const num = Number(req.body[field]);
        if (!isNaN(num)) {
          req.body[field] = num;
          console.log(`✅ Converted ${field} to number:`, num);
        }
      }
    });

    // ========== 4. تحويل القيم المنطقية ==========
    const booleanFields = ['isOpen', 'hasDelivery', 'isAvailable', 'isVerified'];
    
    booleanFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (req.body[field] === 'true' || req.body[field] === true) {
          req.body[field] = true;
        } else if (req.body[field] === 'false' || req.body[field] === false) {
          req.body[field] = false;
        }
        console.log(`✅ Converted ${field} to boolean:`, req.body[field]);
      }
    });

    // ========== 5. التأكد من وجود الحقول المطلوبة ==========
    console.log('📤 Processed req.body:', JSON.stringify(req.body, null, 2));
    
    next();
  } catch (error) {
    console.error('❌ Error in handleFormData:', error);
    next(new AppError('خطأ في معالجة البيانات المرسلة', 400));
  }
};

module.exports = handleFormData;