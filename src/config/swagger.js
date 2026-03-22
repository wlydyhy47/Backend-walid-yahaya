// ============================================
// ملف: src/config/swagger.js (المصحح)
// الوصف: توثيق API باستخدام Swagger
// ============================================

const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Food Delivery API',
      version: '1.0.0',
      description: 'توثيق API لتطبيق توصيل الطعام - النسخة المحدثة',
      contact: {
        name: 'فريق الدعم',
        email: 'support@fooddelivery.com',
        url: 'https://fooddelivery.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      },
      'x-logo': {
        url: '/images/logo.png',
        altText: 'Food Delivery Logo'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000/api/v1',
        description: process.env.NODE_ENV === 'production' ? 'سيرفر الإنتاج' : 'سيرفر التطوير'
      },
      {
        url: 'http://localhost:3000/api/v1',
        description: 'سيرفر محلي'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'أدخل التوكن الخاص بك: Bearer <token>'
        }
      },
      schemas: {
        // ====== المستخدمين ======
        User: {
          type: 'object',
          required: ['name', 'phone', 'password'],
          properties: {
            id: { type: 'string', example: '60d21b4667d0d8992e610c85' },
            name: { type: 'string', example: 'أحمد محمد', description: 'اسم المستخدم' },
            phone: { type: 'string', example: '+212600000000', description: 'رقم الهاتف' },
            email: { type: 'string', format: 'email', example: 'ahmed@example.com', description: 'البريد الإلكتروني (اختياري)' },
            role: { type: 'string', enum: ['client', 'driver', 'admin', 'store_owner'], example: 'client', description: 'دور المستخدم' },
            image: { type: 'string', example: 'https://res.cloudinary.com/.../avatar.jpg', description: 'صورة المستخدم' },
            isVerified: { type: 'boolean', example: true, description: 'هل الحساب موثق؟' },
            isActive: { type: 'boolean', example: true, description: 'هل الحساب نشط؟' },
            createdAt: { type: 'string', format: 'date-time', description: 'تاريخ الإنشاء' }
          }
        },
        Store: {
          type: 'object',
          required: ['name'],
          properties: {
            id: { type: 'string', example: '60d21b4667d0d8992e610c86' },
            name: { type: 'string', example: 'مطعم الأندلس', description: 'اسم المتجر' },
            description: { type: 'string', example: 'أشهى المأكولات العربية', description: 'وصف المتجر' },
            logo: { type: 'string', example: 'https://res.cloudinary.com/.../store.jpg', description: 'شعار المتجر' },
            coverImage: { type: 'string', example: 'https://res.cloudinary.com/.../cover.jpg', description: 'صورة الغلاف' },
            category: { type: 'string', enum: ['store', 'cafe', 'bakery', 'fast-food', 'grocery', 'supermarket', 'pharmacy', 'other'], example: 'store', description: 'نوع المتجر' },
            isOpen: { type: 'boolean', example: true, description: 'هل المتجر مفتوح؟' },
            averageRating: { type: 'number', example: 4.5, description: 'متوسط التقييمات' },
            deliveryInfo: {
              type: 'object',
              properties: {
                hasDelivery: { type: 'boolean', example: true },
                deliveryFee: { type: 'number', example: 10 },
                estimatedDeliveryTime: { type: 'number', example: 30 }
              }
            },
            tags: { type: 'array', items: { type: 'string' }, example: ['عربي', 'مشاوي', 'بيتزا'], description: 'وسوم المتجر' }
          }
        },
        Order: {
          type: 'object',
          required: ['items', 'totalPrice', 'store'],
          properties: {
            id: { type: 'string', example: '60d21b4667d0d8992e610c87' },
            user: { type: 'string', example: '60d21b4667d0d8992e610c85', description: 'معرف المستخدم' },
            store: { type: 'string', example: '60d21b4667d0d8992e610c86', description: 'معرف المتجر' },
            driver: { type: 'string', example: '60d21b4667d0d8992e610c88', description: 'معرف المندوب (اختياري)' },
            items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string', example: 'برجر' }, qty: { type: 'number', example: 2 }, price: { type: 'number', example: 50 }, notes: { type: 'string', example: 'بدون بصل' } } } },
            totalPrice: { type: 'number', example: 120, description: 'السعر الإجمالي' },
            status: { type: 'string', enum: ['pending', 'accepted', 'picked', 'delivered', 'cancelled'], example: 'pending', description: 'حالة الطلب' },
            createdAt: { type: 'string', format: 'date-time', description: 'تاريخ الإنشاء' }
          }
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'تمت العملية بنجاح' },
            data: { type: 'object', description: 'بيانات الاستجابة' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'حدث خطأ في المعالجة' },
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 100 },
            totalPages: { type: 'integer', example: 5 },
            hasNextPage: { type: 'boolean', example: true },
            hasPrevPage: { type: 'boolean', example: false }
          }
        }
      },
      responses: {
        UnauthorizedError: { description: 'التوكن غير صالح أو منتهي الصلاحية', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        NotFoundError: { description: 'المورد غير موجود', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        ValidationError: { description: 'خطأ في التحقق من البيانات', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        RateLimitError: { description: 'تم تجاوز الحد المسموح من الطلبات', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
      }
    },
    tags: [
      { name: 'Auth', description: 'عمليات المصادقة والتسجيل' },
      { name: 'Users', description: 'إدارة المستخدمين والملفات الشخصية' },
      { name: 'Stores', description: 'إدارة المتاجر وقوائم الطعام' },
      { name: 'Orders', description: 'إدارة الطلبات والتتبع' },
      { name: 'Items', description: 'إدارة عناصر القائمة' },
      { name: 'Addresses', description: 'إدارة العناوين' },
      { name: 'Chat', description: 'الدردشة والمراسلة' },
      { name: 'Notifications', description: 'إدارة الإشعارات' },
      { name: 'Admin', description: 'لوحة تحكم المشرف' },
      { name: 'Driver', description: 'لوحة تحكم المندوب' },
      { name: 'Store Owner', description: 'لوحة تحكم صاحب المتجر' },
      { name: 'Loyalty', description: 'برنامج الولاء والنقاط' },
      { name: 'Analytics', description: 'التحليلات والإحصائيات' },
      { name: 'Security', description: 'فحوصات الأمان' },
      { name: 'Assets', description: 'الملفات الثابتة والصور' },
      { name: 'Health', description: 'فحوصات صحة النظام' }
    ],
    externalDocs: { description: 'مستودع GitHub', url: 'https://github.com/yourusername/food-delivery-api' }
  },
  apis: [
    path.join(__dirname, '../routes/*.js'),
    path.join(__dirname, '../controllers/*.js'),
    path.join(__dirname, '../models/*.js')
  ]
};

const specs = swaggerJsdoc(options);

module.exports = specs;